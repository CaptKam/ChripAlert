
import { db } from "../db";
import { sql } from "drizzle-orm";

export class AlertCleanupService {
  private cleanupInterval: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  constructor() {
    // Start cleanup service immediately
    this.startCleanup();
  }

  startCleanup(): void {
    if (this.isRunning) {
      console.log('🧹 Alert cleanup service already running');
      return;
    }

    this.isRunning = true;
    console.log('🧹 Starting alert cleanup service - will run every hour');

    // Run cleanup immediately on startup
    this.performCleanup();

    // Schedule cleanup to run every hour
    this.cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, 60 * 60 * 1000); // 1 hour in milliseconds
  }

  async performCleanup(): Promise<void> {
    try {
      console.log('🧹 Running alert cleanup for alerts older than 24 hours...');

      // Calculate 24 hours ago
      const twentyFourHoursAgo = new Date();
      twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

      // Delete alerts older than 24 hours
      const result = await db.execute(sql`
        DELETE FROM alerts 
        WHERE created_at < ${twentyFourHoursAgo.toISOString()}
      `);

      const deletedCount = result.rowCount || 0;

      if (deletedCount > 0) {
        console.log(`🧹 Cleanup complete: Removed ${deletedCount} alerts older than 24 hours`);
      } else {
        console.log('🧹 Cleanup complete: No old alerts to remove');
      }

      // Also log current alert count for monitoring
      const countResult = await db.execute(sql`SELECT COUNT(*) as count FROM alerts`);
      const totalAlerts = countResult.rows[0]?.count || 0;
      console.log(`📊 Current alert count: ${totalAlerts} alerts in database`);

    } catch (error) {
      console.error('❌ Error during alert cleanup:', error);
    }
  }

  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.isRunning = false;
    console.log('🧹 Alert cleanup service stopped');
  }

  // Manual cleanup method for testing or immediate cleanup
  async cleanupNow(): Promise<number> {
    try {
      console.log('🧹 Manual cleanup triggered...');
      
      const twentyFourHoursAgo = new Date();
      twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

      const result = await db.execute(sql`
        DELETE FROM alerts 
        WHERE created_at < ${twentyFourHoursAgo.toISOString()}
      `);

      const deletedCount = result.rowCount || 0;
      console.log(`🧹 Manual cleanup complete: Removed ${deletedCount} alerts`);
      
      return deletedCount;
    } catch (error) {
      console.error('❌ Error during manual cleanup:', error);
      return 0;
    }
  }

  // Get cleanup stats
  async getCleanupStats(): Promise<{ total: number; old: number; recent: number }> {
    try {
      const twentyFourHoursAgo = new Date();
      twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

      const totalResult = await db.execute(sql`SELECT COUNT(*) as count FROM alerts`);
      const oldResult = await db.execute(sql`
        SELECT COUNT(*) as count FROM alerts 
        WHERE created_at < ${twentyFourHoursAgo.toISOString()}
      `);
      const recentResult = await db.execute(sql`
        SELECT COUNT(*) as count FROM alerts 
        WHERE created_at >= ${twentyFourHoursAgo.toISOString()}
      `);

      return {
        total: parseInt(totalResult.rows[0]?.count || '0'),
        old: parseInt(oldResult.rows[0]?.count || '0'),
        recent: parseInt(recentResult.rows[0]?.count || '0')
      };
    } catch (error) {
      console.error('❌ Error getting cleanup stats:', error);
      return { total: 0, old: 0, recent: 0 };
    }
  }
}

// Export singleton instance
export const alertCleanupService = new AlertCleanupService();
