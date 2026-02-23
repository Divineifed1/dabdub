import { Test, TestingModule } from '@nestjs/testing';
import { AdminAccessLogController } from './admin-access-log.controller';
import { AdminAccessLogService } from './admin-access-log.service';

describe('AdminAccessLogController', () => {
  let controller: AdminAccessLogController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminAccessLogController],
      providers: [AdminAccessLogService],
    }).compile();

    controller = module.get<AdminAccessLogController>(AdminAccessLogController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
