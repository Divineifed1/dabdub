import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class DatabaseSeeder {
  constructor(private dataSource: DataSource) {}

  async seed(): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      await queryRunner.startTransaction();

      // Add seed data here
      // Example:
      // await queryRunner.manager.save(User, [
      //   { email: 'test@example.com', name: 'Test User' },
      // ]);

      await queryRunner.commitTransaction();
      console.log('✓ Database seeding completed');
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('✗ Database seeding failed:', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
