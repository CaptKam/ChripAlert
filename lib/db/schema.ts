
import { sql } from "drizzle-orm";
import { pgTable, text, varchar, boolean, timestamp, jsonb, integer, unique, decimal } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").unique(),
  email: text("email").unique(),
  password: text("password"),
  // OAuth fields
  googleId: text("google_id").unique(),
  appleId: text("apple_id").unique(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  profileImage: text("profile_image"),
  // Authentication method tracking
  authMethod: text("auth_method").notNull().default("local"), // 'local', 'google', 'apple'
  emailVerified: boolean("email_verified").notNull().default(false),
  // Admin role system
  role: text("role").notNull().default("user"), // 'admin', 'manager', 'analyst', 'user'
  // Individual Telegram configuration
  telegramBotToken: text("telegram_bot_token"),
  telegramChatId: text("telegram_chat_id"),
  telegramEnabled: boolean("telegram_enabled").notNull().default(false),
  // Odds API preferences for enhanced gambling insights
  oddsApiEnabled: boolean("odds_api_enabled").notNull().default(false),
  oddsApiKey: text("odds_api_key"), // User's personal Odds API key (optional)
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const teams = pgTable("teams", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  initials: text("initials").notNull(),
  sport: text("sport").notNull(),
  logoColor: text("logo_color").notNull().default("#1D2E5F"),
  monitored: boolean("monitored").notNull().default(false),
  externalId: text("external_id"),
});


export const settings = pgTable("settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sport: text("sport").notNull(),
  preferences: jsonb("preferences").$type<{
    notifications: boolean;
    theme: string;
  }>().notNull(),
  telegramEnabled: boolean("telegram_enabled").notNull().default(false),
  pushNotificationsEnabled: boolean("push_notifications_enabled").notNull().default(false),
});

// User monitored teams for persistent game selection
export const userMonitoredTeams = pgTable("user_monitored_teams", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  gameId: text("game_id").notNull(), // The game ID from live sports API
  sport: text("sport").notNull(),
  homeTeamName: text("home_team_name").notNull(),
  awayTeamName: text("away_team_name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Global alert settings for admin management
export const globalAlertSettings = pgTable("global_alert_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sport: text("sport").notNull(), // MLB, NFL, NBA, CFL, NCAAF, WNBA
  alertType: text("alert_type").notNull(), // RISP, BASES_LOADED, etc.
  enabled: boolean("enabled").notNull().default(true),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  updatedBy: varchar("updated_by").references(() => users.id), // Admin who made the change
}, (table) => ({
  // Unique constraint to prevent duplicate (sport, alertType) combinations
  uniqueSportAlertType: unique("unique_sport_alert_type").on(table.sport, table.alertType)
}));

// Alerts table for storing all alerts
export const alerts = pgTable("alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  alertKey: varchar("alert_key").notNull(),
  // Sequence number for preventing data loss on reconnects
  sequenceNumber: integer("sequence_number").notNull().generatedAlwaysAsIdentity(),
  sport: text("sport").notNull(),
  gameId: text("game_id").notNull(),
  type: text("type").notNull(),
  state: text("state").notNull(),
  score: integer("score").notNull().default(0),
  payload: jsonb("payload").notNull(),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  // Alert persistence: minimum display time to prevent immediate disappearing
  expiresAt: timestamp("expires_at").notNull().default(sql`NOW() + INTERVAL '5 minutes'`),
});

// Broadcast alerts table - one row per alert event, NOT per user
// Users resolve their alerts at read time by joining with their preferences
export const broadcastAlerts = pgTable("broadcast_alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  alertKey: varchar("alert_key").notNull().unique(),
  sequenceNumber: integer("sequence_number").notNull().generatedAlwaysAsIdentity(),
  sport: text("sport").notNull(),
  gameId: text("game_id").notNull(),
  type: text("type").notNull(),
  state: text("state").notNull().default("active"),
  score: integer("score").notNull().default(0),
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull().default(sql`NOW() + INTERVAL '5 minutes'`),
});


// Insert schemas
export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  email: true,
  password: true,
  googleId: true,
  appleId: true,
  firstName: true,
  lastName: true,
  profileImage: true,
  authMethod: true,
}).extend({
  // Make fields flexible for different auth methods
  usernameOrEmail: z.string().optional(),
}).partial().refine(
  (data) => {
    // At least username, email, googleId, or appleId must be provided
    return data.username || data.email || data.googleId || data.appleId || data.usernameOrEmail;
  },
  {
    message: "At least one identifier (username, email, Google ID, or Apple ID) is required",
  }
);

export const insertTeamSchema = createInsertSchema(teams).omit({
  id: true,
});


export const insertSettingsSchema = createInsertSchema(settings).omit({
  id: true,
});

export const insertUserMonitoredTeamSchema = createInsertSchema(userMonitoredTeams).omit({
  id: true,
  createdAt: true,
});

export const insertGlobalAlertSettingsSchema = createInsertSchema(globalAlertSettings).omit({
  id: true,
  updatedAt: true,
});


// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertTeam = z.infer<typeof insertTeamSchema>;
export type Team = typeof teams.$inferSelect;


export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type Settings = typeof settings.$inferSelect;

export type InsertUserMonitoredTeam = z.infer<typeof insertUserMonitoredTeamSchema>;
export type UserMonitoredTeam = typeof userMonitoredTeams.$inferSelect;

// User alert preferences for individual alert types
export const userAlertPreferences = pgTable("user_alert_preferences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sport: text("sport").notNull(), // MLB, NFL, NBA, CFL, NCAAF, WNBA
  alertType: text("alert_type").notNull(), // RISP, CLOSE_GAME, etc.
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertUserAlertPreferencesSchema = createInsertSchema(userAlertPreferences).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUserAlertPreferences = z.infer<typeof insertUserAlertPreferencesSchema>;
export type UserAlertPreferences = typeof userAlertPreferences.$inferSelect;

// Alert schemas and types
export const insertAlertSchema = createInsertSchema(alerts).omit({
  id: true,
  createdAt: true,
});

export const insertBroadcastAlertSchema = createInsertSchema(broadcastAlerts).omit({
  id: true,
  createdAt: true,
});

export type InsertAlert = z.infer<typeof insertAlertSchema>;
export type Alert = typeof alerts.$inferSelect;

export type InsertBroadcastAlert = z.infer<typeof insertBroadcastAlertSchema>;
export type BroadcastAlert = typeof broadcastAlerts.$inferSelect;


// Enhanced game states table for storing live game data with player and weather context
export const gameStates = pgTable("game_states", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  extGameId: text("ext_game_id").notNull(), // External game ID from API (e.g., "776362")
  sport: text("sport").notNull(), // MLB, NFL, NBA, etc.
  homeTeam: text("home_team").notNull(),
  awayTeam: text("away_team").notNull(),
  homeScore: integer("home_score").default(0),
  awayScore: integer("away_score").default(0),
  status: text("status").notNull(), // scheduled, live, final
  inning: integer("inning"),
  isTopInning: boolean("is_top_inning"),
  balls: integer("balls").default(0),
  strikes: integer("strikes").default(0),
  outs: integer("outs").default(0),
  // Base runners
  hasFirst: boolean("has_first").default(false),
  hasSecond: boolean("has_second").default(false),
  hasThird: boolean("has_third").default(false),
  // Enhanced player data
  currentBatter: text("current_batter"),
  currentPitcher: text("current_pitcher"),
  onDeckBatter: text("on_deck_batter"),
  // Weather context
  windSpeed: integer("wind_speed"), // mph
  windDirection: text("wind_direction"), // N, NE, E, SE, S, SW, W, NW
  temperature: integer("temperature"), // Fahrenheit
  humidity: integer("humidity"), // percentage
  // Enhanced data payload for flexibility
  enhancedData: jsonb("enhanced_data").$type<{
    lineupData?: any;
    weatherContext?: any;
    gameState?: string;
    lastUpdated?: string;
  }>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertGameStateSchema = createInsertSchema(gameStates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertGameState = z.infer<typeof insertGameStateSchema>;
export type GameState = typeof gameStates.$inferSelect;

// Game types for live sports data
export interface Game {
  id: string;
  sport: string;
  homeTeam: {
    id: string;
    name: string;
    abbreviation: string;
    score?: number;
  };
  awayTeam: {
    id: string;
    name: string;
    abbreviation: string;
    score?: number;
  };
  startTime: string;
  status: 'scheduled' | 'live' | 'final';
  venue?: string;
  isSelected?: boolean;
  isLive?: boolean;
  isCompleted?: boolean;
  // MLB-specific fields
  inning?: number;
  inningState?: string;
  gameState?: string;
  gamePk?: number;
  // NFL/NCAAF/CFL-specific fields
  quarter?: number;
  timeRemaining?: string;
  down?: number;
  yardsToGo?: number;
  fieldPosition?: string;
  possession?: string;
  homeTimeoutsRemaining?: number;
  awayTimeoutsRemaining?: number;
  // NBA/WNBA-specific fields
  period?: number;
}

export interface GameDay {
  date: string;
  games: Game[];
}

// Gambling insights interface for enhanced alert data
export interface GamblingInsights {
  structuredTemplate?: string; // New structured format with emojis
  market?: {
    moneyline?: {
      home?: number;
      away?: number;
    };
    spread?: {
      points?: number;
      home?: number;
      away?: number;
    };
    total?: {
      points?: number;
      over?: number;
      under?: number;
    };
  };
  weather?: {
    impact: string;
    conditions: string;
    severity: 'low' | 'medium' | 'high';
  };
  keyPlayers?: {
    name: string;
    position: string;
    relevance: string;
  }[];
  momentum?: {
    recent: string;
    trend: 'positive' | 'negative' | 'neutral';
    timeframe: string;
  };
  situation?: {
    context: string;
    significance: string;
    timing: string;
  };
  bullets?: string[];
  confidence?: number; // 0-1 rating
  tags?: string[];
}

// Enhanced AlertResult interface with gambling insights
export interface AlertResult {
  alertKey: string;
  type: string;
  message: string;
  displayMessage?: string;
  context: any;
  priority: number;
  gamblingInsights?: GamblingInsights;
  hasComposerEnhancement?: boolean;
}

// Zod schema for GamblingInsights validation
export const gamblingInsightsSchema = z.object({
  market: z.object({
    moneyline: z.object({
      home: z.number().optional(),
      away: z.number().optional(),
    }).optional(),
    spread: z.object({
      points: z.number().optional(),
      home: z.number().optional(),
      away: z.number().optional(),
    }).optional(),
    total: z.object({
      points: z.number().optional(),
      over: z.number().optional(),
      under: z.number().optional(),
    }).optional(),
  }).optional(),
  weather: z.object({
    impact: z.string(),
    conditions: z.string(),
    severity: z.enum(['low', 'medium', 'high']),
  }).optional(),
  keyPlayers: z.array(z.object({
    name: z.string(),
    position: z.string(),
    relevance: z.string(),
  })).optional(),
  momentum: z.object({
    recent: z.string(),
    trend: z.enum(['positive', 'negative', 'neutral']),
    timeframe: z.string(),
  }).optional(),
  situation: z.object({
    context: z.string(),
    significance: z.string(),
    timing: z.string(),
  }).optional(),
  bullets: z.array(z.string()).min(1).optional(),
  confidence: z.number().min(0).max(1).optional(),
  tags: z.array(z.string()).optional(),
});

// Zod schema for AlertResult validation
export const alertResultSchema = z.object({
  alertKey: z.string(),
  type: z.string(),
  message: z.string(),
  displayMessage: z.string().optional(),
  context: z.any(),
  priority: z.number(),
  gamblingInsights: gamblingInsightsSchema.optional(),
  hasComposerEnhancement: z.boolean().optional(),
});

// Export types derived from Zod schemas  
export type GamblingInsightsType = z.infer<typeof gamblingInsightsSchema>;
export type AlertResultType = z.infer<typeof alertResultSchema>;
