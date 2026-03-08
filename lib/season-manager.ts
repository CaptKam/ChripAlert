/**
 * Season Management Utility for ChirpBot V3
 * Provides intelligent sport ordering based on active seasons
 */

export interface SportSeason {
  sport: string;
  startMonth: number;  // 1-12 (January = 1)
  endMonth: number;    // 1-12 (December = 12)
  priority: number;    // Higher = more priority when seasons overlap
  color: {
    border: string;
    text: string; 
    bg: string;
  };
}

// Sport season definitions with priorities and colors
// NOTE: Only MLB is active right now. Other sports are commented out temporarily.
export const SPORT_SEASONS: SportSeason[] = [
  {
    sport: 'MLB',
    startMonth: 4,    // April
    endMonth: 10,     // October
    priority: 90,     // High priority during summer
    color: { border: 'border-green-500', text: 'text-green-400', bg: 'bg-green-500/10' }
  },
  // {
  //   sport: 'NFL',
  //   startMonth: 9,    // September
  //   endMonth: 2,      // February (crosses year boundary)
  //   priority: 100,    // Highest priority during fall/winter
  //   color: { border: 'border-orange-500', text: 'text-orange-400', bg: 'bg-orange-500/10' }
  // },
  // {
  //   sport: 'NBA',
  //   startMonth: 10,   // October
  //   endMonth: 6,      // June (crosses year boundary)
  //   priority: 85,     // High priority during winter/spring
  //   color: { border: 'border-purple-500', text: 'text-purple-400', bg: 'bg-purple-500/10' }
  // },
  // {
  //   sport: 'NCAAF',
  //   startMonth: 8,    // August
  //   endMonth: 1,      // January (crosses year boundary)
  //   priority: 75,     // Popular during college season
  //   color: { border: 'border-blue-500', text: 'text-blue-400', bg: 'bg-blue-500/10' }
  // },
  // {
  //   sport: 'CFL',
  //   startMonth: 6,    // June
  //   endMonth: 11,     // November
  //   priority: 60,     // Lower priority
  //   color: { border: 'border-red-500', text: 'text-red-400', bg: 'bg-red-500/10' }
  // },
  // {
  //   sport: 'WNBA',
  //   startMonth: 5,    // May
  //   endMonth: 10,     // October
  //   priority: 70,     // Good priority during summer
  //   color: { border: 'border-pink-500', text: 'text-pink-400', bg: 'bg-pink-500/10' }
  // }
];

/**
 * Check if a sport season is currently active
 */
export function isSeasonActive(season: SportSeason, currentDate = new Date()): boolean {
  const currentMonth = currentDate.getMonth() + 1; // JavaScript months are 0-indexed
  
  // Handle seasons that cross year boundaries (e.g., NFL: Sep-Feb)
  if (season.startMonth > season.endMonth) {
    return currentMonth >= season.startMonth || currentMonth <= season.endMonth;
  }
  
  // Handle normal seasons (e.g., MLB: Apr-Oct)
  return currentMonth >= season.startMonth && currentMonth <= season.endMonth;
}

/**
 * Get months until next season starts
 */
export function monthsUntilSeason(season: SportSeason, currentDate = new Date()): number {
  const currentMonth = currentDate.getMonth() + 1;
  
  if (isSeasonActive(season, currentDate)) {
    return 0; // Already active
  }
  
  let monthsUntil: number;
  
  // Handle seasons that cross year boundaries (e.g., NFL: Sep-Feb)
  if (season.startMonth > season.endMonth) {
    if (currentMonth <= season.endMonth) {
      // We're in early year, after season ended, wait for next start
      // e.g., March (3) waiting for NFL to start in September (9) = 6 months
      monthsUntil = season.startMonth - currentMonth;
      if (monthsUntil <= 0) monthsUntil += 12;
    } else if (currentMonth >= season.startMonth) {
      // We're in the start period but season isn't active yet (edge case)
      // This should be 0 since we're at/past start month but caught by isSeasonActive check above
      monthsUntil = 0;
    } else {
      // We're between end and start (e.g., March-August for NFL)
      monthsUntil = season.startMonth - currentMonth;
    }
  } else {
    // Handle normal seasons (e.g., MLB: Apr-Oct)
    if (currentMonth < season.startMonth) {
      // Before season starts this year
      monthsUntil = season.startMonth - currentMonth;
    } else {
      // After season ended, wait until next year
      monthsUntil = (12 - currentMonth) + season.startMonth;
    }
  }
  
  return monthsUntil;
}

/**
 * Sort sports by season relevance
 */
export function sortSportsBySeason(sports: string[], currentDate = new Date()): string[] {
  // Get season data for available sports
  const sportSeasonMap = new Map(SPORT_SEASONS.map(s => [s.sport, s]));
  
  return sports.sort((a, b) => {
    const seasonA = sportSeasonMap.get(a);
    const seasonB = sportSeasonMap.get(b);
    
    // Handle unknown sports (put at end)
    if (!seasonA && !seasonB) return 0;
    if (!seasonA) return 1;
    if (!seasonB) return -1;
    
    const isActiveA = isSeasonActive(seasonA, currentDate);
    const isActiveB = isSeasonActive(seasonB, currentDate);
    
    // Active seasons come first
    if (isActiveA && !isActiveB) return -1;
    if (!isActiveA && isActiveB) return 1;
    
    // Both active: sort by priority
    if (isActiveA && isActiveB) {
      return seasonB.priority - seasonA.priority;
    }
    
    // Both inactive: sort by how soon they start
    const monthsA = monthsUntilSeason(seasonA, currentDate);
    const monthsB = monthsUntilSeason(seasonB, currentDate);
    
    if (monthsA !== monthsB) {
      return monthsA - monthsB;
    }
    
    // Same months until season: sort by priority
    return seasonB.priority - seasonA.priority;
  });
}

/**
 * Get organized sports with metadata
 */
export function getOrganizedSports(sports: string[], currentDate = new Date()) {
  const sortedSports = sortSportsBySeason(sports, currentDate);
  const sportSeasonMap = new Map(SPORT_SEASONS.map(s => [s.sport, s]));
  
  return {
    sorted: sortedSports,
    active: sortedSports.filter(sport => {
      const season = sportSeasonMap.get(sport);
      return season && isSeasonActive(season, currentDate);
    }),
    inactive: sortedSports.filter(sport => {
      const season = sportSeasonMap.get(sport);
      return season && !isSeasonActive(season, currentDate);
    }),
    metadata: sortedSports.map(sport => {
      const season = sportSeasonMap.get(sport);
      if (!season) return { sport, isActive: false, monthsUntil: 999 };
      
      return {
        sport,
        isActive: isSeasonActive(season, currentDate),
        monthsUntil: monthsUntilSeason(season, currentDate),
        priority: season.priority,
        color: season.color
      };
    })
  };
}

/**
 * Get sport colors for SportTabs (maintains backward compatibility)
 */
export function getSportTabColors(sport: string): { border: string; text: string; bg: string } {
  const season = SPORT_SEASONS.find(s => s.sport.toUpperCase() === sport.toUpperCase());
  return season?.color || { border: 'border-emerald-500', text: 'text-emerald-400', bg: 'bg-emerald-500/10' };
}

// Export default sports array sorted by current season
export function getSeasonAwareSports(currentDate = new Date()): string[] {
  const allSports = ["MLB"];
  return sortSportsBySeason(allSports, currentDate);
}