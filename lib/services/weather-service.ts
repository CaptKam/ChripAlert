import { db } from '../db';

export interface WeatherData {
  temperature: number;
  condition: string;
  windSpeed: number;
  windDirection: number;
  windGust?: number;
  humidity: number;
  pressure: number;
  timestamp: string;
  stadiumWindContext?: string;
}

interface StadiumCoordinates {
  lat: number;
  lon: number;
  city: string;
  stadium: string;
  homePlateDirection?: number; // Degrees from north to center field (MLB)
  fieldOrientation?: number; // Degrees from north to field direction (NFL)
  isDome?: boolean;
  elevation?: number; // Feet above sea level
  roofType?: 'open' | 'dome' | 'retractable'; // NFL-specific roof classification
  sport?: 'MLB' | 'NFL';
}

// MLB Stadium coordinates with home plate orientations (degrees from north to center field)
const STADIUMS: Record<string, StadiumCoordinates> = {
  'Arizona Diamondbacks': { lat: 33.4453, lon: -112.0667, city: 'Phoenix', stadium: 'Chase Field', homePlateDirection: 95, isDome: true },
  'Atlanta Braves': { lat: 33.8902, lon: -84.4677, city: 'Atlanta', stadium: 'Truist Park', homePlateDirection: 95 },
  'Baltimore Orioles': { lat: 39.2837, lon: -76.6218, city: 'Baltimore', stadium: 'Oriole Park', homePlateDirection: 62 },
  'Boston Red Sox': { lat: 42.3467, lon: -71.0972, city: 'Boston', stadium: 'Fenway Park', homePlateDirection: 95 },
  'Chicago Cubs': { lat: 41.9484, lon: -87.6553, city: 'Chicago', stadium: 'Wrigley Field', homePlateDirection: 95 },
  'Chicago White Sox': { lat: 41.8299, lon: -87.6338, city: 'Chicago', stadium: 'Guaranteed Rate Field', homePlateDirection: 176 },
  'Cincinnati Reds': { lat: 39.0974, lon: -84.5068, city: 'Cincinnati', stadium: 'Great American Ball Park', homePlateDirection: 95 },
  'Cleveland Guardians': { lat: 41.4958, lon: -81.6852, city: 'Cleveland', stadium: 'Progressive Field', homePlateDirection: 169 },
  'Colorado Rockies': { lat: 39.7559, lon: -104.9942, city: 'Denver', stadium: 'Coors Field', homePlateDirection: 95, elevation: 5200 },
  'Detroit Tigers': { lat: 42.3391, lon: -83.0485, city: 'Detroit', stadium: 'Comerica Park', homePlateDirection: 95 },
  'Houston Astros': { lat: 29.7572, lon: -95.3555, city: 'Houston', stadium: 'Minute Maid Park', homePlateDirection: 107, isDome: true },
  'Kansas City Royals': { lat: 39.0517, lon: -94.4803, city: 'Kansas City', stadium: 'Kauffman Stadium', homePlateDirection: 95 },
  'Los Angeles Angels': { lat: 33.8003, lon: -117.8827, city: 'Anaheim', stadium: 'Angel Stadium', homePlateDirection: 95 },
  'Los Angeles Dodgers': { lat: 34.0739, lon: -118.2400, city: 'Los Angeles', stadium: 'Dodger Stadium', homePlateDirection: 95 },
  'Miami Marlins': { lat: 25.7781, lon: -80.2197, city: 'Miami', stadium: 'loanDepot park', homePlateDirection: 95, isDome: true },
  'Milwaukee Brewers': { lat: 43.0280, lon: -87.9712, city: 'Milwaukee', stadium: 'American Family Field', homePlateDirection: 95, isDome: true },
  'Minnesota Twins': { lat: 44.9817, lon: -93.2776, city: 'Minneapolis', stadium: 'Target Field', homePlateDirection: 104 },
  'New York Mets': { lat: 40.7571, lon: -73.8458, city: 'New York', stadium: 'Citi Field', homePlateDirection: 95 },
  'New York Yankees': { lat: 40.8296, lon: -73.9262, city: 'New York', stadium: 'Yankee Stadium', homePlateDirection: 95 },
  'Oakland Athletics': { lat: 37.7516, lon: -122.2005, city: 'Oakland', stadium: 'Oakland Coliseum', homePlateDirection: 95 },
  'Athletics': { lat: 37.7516, lon: -122.2005, city: 'Oakland', stadium: 'Oakland Coliseum', homePlateDirection: 95 }, // Alias for Oakland Athletics
  'Philadelphia Phillies': { lat: 39.9061, lon: -75.1665, city: 'Philadelphia', stadium: 'Citizens Bank Park', homePlateDirection: 95 },
  'Pittsburgh Pirates': { lat: 40.4469, lon: -80.0057, city: 'Pittsburgh', stadium: 'PNC Park', homePlateDirection: 95 },
  'San Diego Padres': { lat: 32.7073, lon: -117.1566, city: 'San Diego', stadium: 'Petco Park', homePlateDirection: 95 },
  'San Francisco Giants': { lat: 37.7786, lon: -122.3893, city: 'San Francisco', stadium: 'Oracle Park', homePlateDirection: 95 },
  'Seattle Mariners': { lat: 47.5914, lon: -122.3326, city: 'Seattle', stadium: 'T-Mobile Park', homePlateDirection: 95, isDome: true },
  'St. Louis Cardinals': { lat: 38.6226, lon: -90.1928, city: 'St. Louis', stadium: 'Busch Stadium', homePlateDirection: 95 },
  'Tampa Bay Rays': { lat: 27.7682, lon: -82.6534, city: 'St. Petersburg', stadium: 'Tropicana Field', homePlateDirection: 95, isDome: true },
  'Texas Rangers': { lat: 32.7472, lon: -97.0833, city: 'Arlington', stadium: 'Globe Life Field', homePlateDirection: 95, isDome: true },
  'Toronto Blue Jays': { lat: 43.6414, lon: -79.3894, city: 'Toronto', stadium: 'Rogers Centre', homePlateDirection: 95, isDome: true },
  'Washington Nationals': { lat: 38.8730, lon: -77.0074, city: 'Washington', stadium: 'Nationals Park', homePlateDirection: 95 },

  // NFL Stadium coordinates with field orientations and roof classifications
  'Arizona Cardinals': { lat: 33.5276, lon: -112.2626, city: 'Glendale', stadium: 'State Farm Stadium', fieldOrientation: 15, roofType: 'retractable', sport: 'NFL' },
  'Atlanta Falcons': { lat: 33.7553, lon: -84.4006, city: 'Atlanta', stadium: 'Mercedes-Benz Stadium', fieldOrientation: 6, roofType: 'retractable', sport: 'NFL' },
  'Baltimore Ravens': { lat: 39.2780, lon: -76.6227, city: 'Baltimore', stadium: 'M&T Bank Stadium', fieldOrientation: 14, roofType: 'open', sport: 'NFL' },
  'Buffalo Bills': { lat: 42.7738, lon: -78.7870, city: 'Orchard Park', stadium: 'Highmark Stadium', fieldOrientation: 18, roofType: 'open', sport: 'NFL' },
  'Carolina Panthers': { lat: 35.2258, lon: -80.8528, city: 'Charlotte', stadium: 'Bank of America Stadium', fieldOrientation: 12, roofType: 'open', sport: 'NFL' },
  'Chicago Bears': { lat: 41.8623, lon: -87.6167, city: 'Chicago', stadium: 'Soldier Field', fieldOrientation: 9, roofType: 'open', sport: 'NFL' },
  'Cincinnati Bengals': { lat: 39.0955, lon: -84.5161, city: 'Cincinnati', stadium: 'Paycor Stadium', fieldOrientation: 20, roofType: 'open', sport: 'NFL' },
  'Cleveland Browns': { lat: 41.5061, lon: -81.6995, city: 'Cleveland', stadium: 'Cleveland Browns Stadium', fieldOrientation: 180, roofType: 'open', sport: 'NFL' },
  'Dallas Cowboys': { lat: 32.7473, lon: -97.0945, city: 'Arlington', stadium: 'AT&T Stadium', fieldOrientation: 9, roofType: 'retractable', sport: 'NFL' },
  'Denver Broncos': { lat: 39.7439, lon: -105.0201, city: 'Denver', stadium: 'Empower Field at Mile High', fieldOrientation: 5, roofType: 'open', elevation: 5280, sport: 'NFL' },
  'Detroit Lions': { lat: 42.3400, lon: -83.0456, city: 'Detroit', stadium: 'Ford Field', fieldOrientation: 320, roofType: 'dome', sport: 'NFL' },
  'Green Bay Packers': { lat: 44.5013, lon: -88.0622, city: 'Green Bay', stadium: 'Lambeau Field', fieldOrientation: 0, roofType: 'open', sport: 'NFL' },
  'Houston Texans': { lat: 29.6847, lon: -95.4107, city: 'Houston', stadium: 'NRG Stadium', fieldOrientation: 350, roofType: 'retractable', sport: 'NFL' },
  'Indianapolis Colts': { lat: 39.7601, lon: -86.1639, city: 'Indianapolis', stadium: 'Lucas Oil Stadium', fieldOrientation: 16, roofType: 'retractable', sport: 'NFL' },
  'Jacksonville Jaguars': { lat: 30.3238, lon: -81.6374, city: 'Jacksonville', stadium: 'TIAA Bank Field', fieldOrientation: 70, roofType: 'open', sport: 'NFL' },
  'Kansas City Chiefs': { lat: 39.0489, lon: -94.4839, city: 'Kansas City', stadium: 'Arrowhead Stadium', fieldOrientation: 10, roofType: 'open', sport: 'NFL' },
  'Las Vegas Raiders': { lat: 36.0909, lon: -115.1833, city: 'Las Vegas', stadium: 'Allegiant Stadium', fieldOrientation: 340, roofType: 'dome', sport: 'NFL' },
  'Los Angeles Chargers': { lat: 33.8641, lon: -118.2611, city: 'Inglewood', stadium: 'SoFi Stadium', fieldOrientation: 7, roofType: 'open', sport: 'NFL' },
  'Los Angeles Rams': { lat: 33.8641, lon: -118.2611, city: 'Inglewood', stadium: 'SoFi Stadium', fieldOrientation: 7, roofType: 'open', sport: 'NFL' },
  'Miami Dolphins': { lat: 25.9580, lon: -80.2389, city: 'Miami Gardens', stadium: 'Hard Rock Stadium', fieldOrientation: 347, roofType: 'open', sport: 'NFL' },
  'Minnesota Vikings': { lat: 44.9778, lon: -93.2581, city: 'Minneapolis', stadium: 'U.S. Bank Stadium', fieldOrientation: 340, roofType: 'dome', sport: 'NFL' },
  'New England Patriots': { lat: 42.0909, lon: -71.2643, city: 'Foxborough', stadium: 'Gillette Stadium', fieldOrientation: 8, roofType: 'open', sport: 'NFL' },
  'New Orleans Saints': { lat: 29.9511, lon: -90.0812, city: 'New Orleans', stadium: 'Caesars Superdome', fieldOrientation: 90, roofType: 'dome', sport: 'NFL' },
  'New York Giants': { lat: 40.8135, lon: -74.0745, city: 'East Rutherford', stadium: 'MetLife Stadium', fieldOrientation: 145, roofType: 'open', sport: 'NFL' },
  'New York Jets': { lat: 40.8135, lon: -74.0745, city: 'East Rutherford', stadium: 'MetLife Stadium', fieldOrientation: 145, roofType: 'open', sport: 'NFL' },
  'Philadelphia Eagles': { lat: 39.9008, lon: -75.1675, city: 'Philadelphia', stadium: 'Lincoln Financial Field', fieldOrientation: 355, roofType: 'open', sport: 'NFL' },
  'Pittsburgh Steelers': { lat: 40.4468, lon: -80.0158, city: 'Pittsburgh', stadium: 'Acrisure Stadium', fieldOrientation: 61, roofType: 'open', sport: 'NFL' },
  'San Francisco 49ers': { lat: 37.4031, lon: -121.9695, city: 'Santa Clara', stadium: "Levi's Stadium", fieldOrientation: 16, roofType: 'open', sport: 'NFL' },
  'Seattle Seahawks': { lat: 47.5952, lon: -122.3316, city: 'Seattle', stadium: 'Lumen Field', fieldOrientation: 334, roofType: 'open', sport: 'NFL' },
  'Tampa Bay Buccaneers': { lat: 27.9759, lon: -82.5033, city: 'Tampa', stadium: 'Raymond James Stadium', fieldOrientation: 15, roofType: 'open', sport: 'NFL' },
  'Tennessee Titans': { lat: 36.1665, lon: -86.7713, city: 'Nashville', stadium: 'Nissan Stadium', fieldOrientation: 180, roofType: 'open', sport: 'NFL' },
  'Washington Commanders': { lat: 38.9077, lon: -76.8645, city: 'Landover', stadium: 'FedExField', fieldOrientation: 6, roofType: 'open', sport: 'NFL' }
};

export class WeatherService {
  private apiKey: string;
  private weatherCache: Map<string, { data: WeatherData; timestamp: number }> = new Map();
  private readonly CACHE_DURATION = 60 * 1000; // 1 minute cache

  constructor() {
    this.apiKey = process.env.OPENWEATHERMAP_API_KEY || '';
    
    // Check for disable flags first
    if (!this.checkIfEnabled()) {
      this.apiKey = ''; // Disable weather API calls
      console.log('🚫 Weather System: DISABLED via disable flags');
      return;
    }
    
    if (!this.apiKey) {
      console.warn('⚠️ OpenWeatherMap API key not configured - using fallback data');
      console.warn('⚠️ Set OPENWEATHERMAP_API_KEY in Secrets for live weather data');
    }
  }

  // Check if Weather system is enabled
  private checkIfEnabled(): boolean {
    // Weather system is enabled by default
    // Could add environment variable check here if needed
    return true;
  }

  async getWeatherForTeam(teamName: string): Promise<WeatherData> {
    const now = Date.now();
    const cached = this.weatherCache.get(teamName);
    
    // Return cached data if it's less than 1 minute old
    if (cached && (now - cached.timestamp) < this.CACHE_DURATION) {
      return cached.data;
    }

    const stadium = STADIUMS[teamName];
    
    if (!stadium) {
      console.warn(`🌤️ No stadium coordinates found for ${teamName}, using fallback`);
      const fallbackData = this.getFallbackWeather();
      this.weatherCache.set(teamName, { data: fallbackData, timestamp: now });
      return fallbackData;
    }

    if (!this.apiKey) {
      const fallbackData = this.getFallbackWeather();
      this.weatherCache.set(teamName, { data: fallbackData, timestamp: now });
      return fallbackData;
    }

    try {
      const response = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?lat=${stadium.lat}&lon=${stadium.lon}&appid=${this.apiKey}&units=imperial`
      );

      if (!response.ok) {
        throw new Error(`Weather API error: ${response.status}`);
      }

      const data = await response.json();
      
      const weatherData = {
        temperature: Math.round(data.main.temp),
        condition: data.weather[0].main,
        windSpeed: Math.round(data.wind?.speed || 0),
        windDirection: data.wind?.deg || 0,
        windGust: data.wind?.gust ? Math.round(data.wind.gust) : undefined,
        humidity: data.main.humidity,
        pressure: data.main.pressure,
        timestamp: new Date().toISOString(),
        stadiumWindContext: this.getStadiumWindContext(data.wind?.deg || 0, data.wind?.speed || 0, stadium)
      };

      // Cache the fresh data
      this.weatherCache.set(teamName, { data: weatherData, timestamp: now });
      
      return weatherData;
    } catch (error) {
      console.error(`🌤️ Weather API error for ${teamName}:`, error);
      const fallbackData = this.getFallbackWeather();
      this.weatherCache.set(teamName, { data: fallbackData, timestamp: now });
      return fallbackData;
    }
  }

  private getFallbackWeather(): WeatherData {
    return {
      temperature: 72,
      condition: 'Clear',
      windSpeed: 5,
      windDirection: 270,
      humidity: 50,
      pressure: 1013,
      timestamp: new Date().toISOString()
    };
  }

  // Calculate home run probability based on weather conditions (MLB)
  calculateHomeRunFactor(weather: WeatherData): number {
    let factor = 1.0;

    // Temperature effect (warmer = better carry)
    if (weather.temperature > 80) factor += 0.1;
    else if (weather.temperature < 60) factor -= 0.1;

    // Wind effect (tailwind helps, headwind hurts)
    if (weather.windSpeed > 10) {
      // Assuming wind direction 180-360 is favorable (outfield direction)
      if (weather.windDirection >= 180 && weather.windDirection <= 360) {
        factor += 0.15; // Tailwind
      } else {
        factor -= 0.1; // Headwind
      }
    }

    // Humidity effect (lower humidity = better carry)
    if (weather.humidity < 40) factor += 0.05;
    else if (weather.humidity > 70) factor -= 0.05;

    // Pressure effect (higher pressure = denser air = less carry)
    if (weather.pressure < 1000) factor += 0.05;
    else if (weather.pressure > 1020) factor -= 0.05;

    return Math.max(0.7, Math.min(1.4, factor)); // Clamp between 0.7 and 1.4
  }

  // Calculate field goal success probability modifier based on weather (NFL)
  calculateFieldGoalWeatherFactor(weather: WeatherData, distance: number = 40): number {
    let factor = 1.0;

    // Wind impact is most critical for field goals
    if (weather.windSpeed > 10) {
      // Crosswinds are most challenging
      const windImpact = Math.min(weather.windSpeed / 40, 0.4); // Cap at 40% reduction
      factor -= windImpact;
      
      // Headwinds hurt more than tailwinds help on long kicks
      if (weather.windSpeed > 15) {
        factor -= 0.1; // Additional penalty for strong winds
      }
    }

    // Temperature effects on ball and air density
    if (weather.temperature < 32) {
      factor -= 0.15; // Cold weather significantly impacts kicking
    } else if (weather.temperature < 50) {
      factor -= 0.08; // Mild cold impact
    } else if (weather.temperature > 85) {
      factor += 0.05; // Hot weather slightly helps
    }

    // Precipitation impact
    if (weather.condition.toLowerCase().includes('rain')) {
      factor -= 0.2; // Rain significantly impacts footing and ball handling
    } else if (weather.condition.toLowerCase().includes('snow')) {
      factor -= 0.25; // Snow is worse than rain
    }

    // Distance factor - longer kicks more affected by weather
    if (distance > 45) {
      factor *= 0.95; // Long kicks more susceptible
    } else if (distance > 50) {
      factor *= 0.9; // Very long kicks significantly more affected
    }

    return Math.max(0.3, Math.min(1.2, factor)); // Clamp between 30% and 120%
  }

  // Calculate passing game effectiveness based on weather (NFL)
  calculatePassingWeatherFactor(weather: WeatherData): number {
    let factor = 1.0;

    // Wind significantly affects passing accuracy
    if (weather.windSpeed > 12) {
      factor -= Math.min(weather.windSpeed / 50, 0.3); // Up to 30% reduction
    }

    // Temperature effects on ball handling
    if (weather.temperature < 35) {
      factor -= 0.12; // Cold makes ball harder to grip
    } else if (weather.temperature < 50) {
      factor -= 0.06; // Mild cold impact
    }

    // Precipitation is very bad for passing
    if (weather.condition.toLowerCase().includes('rain')) {
      factor -= 0.25; // Rain makes ball slippery
    } else if (weather.condition.toLowerCase().includes('snow')) {
      factor -= 0.35; // Snow is worse for passing
    }

    // Humidity affects ball grip
    if (weather.humidity > 80) {
      factor -= 0.05; // High humidity makes ball slippery
    }

    return Math.max(0.4, Math.min(1.1, factor)); // Clamp between 40% and 110%
  }

  // Calculate running game effectiveness based on weather (NFL)
  calculateRunningWeatherFactor(weather: WeatherData): number {
    let factor = 1.0;

    // Running is less affected by wind
    if (weather.windSpeed > 20) {
      factor -= 0.05; // Only extreme winds affect running
    }

    // Cold weather slightly favors running
    if (weather.temperature < 40) {
      factor += 0.08; // Cold weather slightly favors ground game
    }

    // Precipitation affects footing but less than passing
    if (weather.condition.toLowerCase().includes('rain')) {
      factor -= 0.1; // Rain affects footing
    } else if (weather.condition.toLowerCase().includes('snow')) {
      factor -= 0.15; // Snow affects footing more
    }

    return Math.max(0.7, Math.min(1.2, factor)); // Clamp between 70% and 120%
  }

  // Get weather impact assessment for NFL strategy
  getNFLWeatherImpact(weather: WeatherData): {
    fieldGoalDifficulty: 'low' | 'moderate' | 'high' | 'extreme';
    passingConditions: 'excellent' | 'good' | 'poor' | 'dangerous';
    preferredStrategy: 'balanced' | 'run-heavy' | 'pass-heavy' | 'conservative';
    weatherAlert: boolean;
    description: string;
  } {
    const fieldGoalFactor = this.calculateFieldGoalWeatherFactor(weather);
    const passingFactor = this.calculatePassingWeatherFactor(weather);
    const runningFactor = this.calculateRunningWeatherFactor(weather);

    // Determine field goal difficulty
    let fieldGoalDifficulty: 'low' | 'moderate' | 'high' | 'extreme';
    if (fieldGoalFactor > 0.9) fieldGoalDifficulty = 'low';
    else if (fieldGoalFactor > 0.7) fieldGoalDifficulty = 'moderate';
    else if (fieldGoalFactor > 0.5) fieldGoalDifficulty = 'high';
    else fieldGoalDifficulty = 'extreme';

    // Determine passing conditions
    let passingConditions: 'excellent' | 'good' | 'poor' | 'dangerous';
    if (passingFactor > 0.9) passingConditions = 'excellent';
    else if (passingFactor > 0.75) passingConditions = 'good';
    else if (passingFactor > 0.6) passingConditions = 'poor';
    else passingConditions = 'dangerous';

    // Determine preferred strategy
    let preferredStrategy: 'balanced' | 'run-heavy' | 'pass-heavy' | 'conservative';
    if (runningFactor > passingFactor + 0.15) {
      preferredStrategy = 'run-heavy';
    } else if (passingFactor > runningFactor + 0.1) {
      preferredStrategy = 'pass-heavy';
    } else if (fieldGoalFactor < 0.7 || passingFactor < 0.7) {
      preferredStrategy = 'conservative';
    } else {
      preferredStrategy = 'balanced';
    }

    // Weather alert for extreme conditions
    const weatherAlert = weather.windSpeed > 15 || 
                        weather.temperature < 32 || 
                        weather.condition.toLowerCase().includes('rain') || 
                        weather.condition.toLowerCase().includes('snow');

    // Create description
    let description = '';
    if (weather.windSpeed > 15) {
      description += `Strong ${weather.windSpeed}mph winds affecting kicks and passes. `;
    }
    if (weather.temperature < 32) {
      description += `Freezing conditions impacting ball handling. `;
    }
    if (weather.condition.toLowerCase().includes('rain') || weather.condition.toLowerCase().includes('snow')) {
      description += `Precipitation creating slippery conditions. `;
    }
    if (!description) {
      description = 'Favorable weather conditions for all aspects of the game.';
    }

    return {
      fieldGoalDifficulty,
      passingConditions,
      preferredStrategy,
      weatherAlert,
      description: description.trim()
    };
  }

  getWindDescription(windSpeed: number, windDirection: number): string {
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const directionIndex = Math.round(windDirection / 22.5) % 16;
    const direction = directions[directionIndex];
    
    if (windSpeed < 5) return 'Light winds';
    if (windSpeed < 15) return `${windSpeed}mph ${direction}`;
    return `Strong ${windSpeed}mph ${direction} winds`;
  }

  // Get wind direction relative to stadium layout
  getStadiumWindContext(windDirection: number, windSpeed: number, stadium: StadiumCoordinates): string {
    if (stadium.isDome) {
      return 'Dome - No wind impact';
    }

    if (windSpeed < 5) {
      return 'Light winds';
    }

    const homePlateDirection = stadium.homePlateDirection || 95;
    
    // Calculate relative wind direction to stadium
    let relativeDegree = windDirection - homePlateDirection;
    if (relativeDegree < 0) relativeDegree += 360;
    if (relativeDegree >= 360) relativeDegree -= 360;

    // Determine field impact
    let fieldContext = '';
    if (relativeDegree >= 315 || relativeDegree < 45) {
      fieldContext = 'to center field';
    } else if (relativeDegree >= 45 && relativeDegree < 135) {
      fieldContext = 'to left field';
    } else if (relativeDegree >= 135 && relativeDegree < 225) {
      fieldContext = 'in from center field';
    } else {
      fieldContext = 'to right field';
    }

    // Add elevation context for Coors Field
    let elevationNote = '';
    if (stadium.elevation && stadium.elevation > 3000) {
      elevationNote = ' (high altitude)';
    }

    return `${windSpeed}mph ${fieldContext}${elevationNote}`;
  }

  // Check if using live weather data
  isUsingLiveData(): boolean {
    return !!this.apiKey;
  }

  // Get current weather data source
  getDataSource(): string {
    return this.apiKey ? 'OpenWeatherMap API' : 'Fallback Data';
  }
}

export const weatherService = new WeatherService();