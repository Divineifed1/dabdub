import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddBackupCodeHashesToUsers1708800000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'users',
      new TableColumn({
        name: 'backupCodeHashes',
        type: 'text',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('users', 'backupCodeHashes');
  }
}
