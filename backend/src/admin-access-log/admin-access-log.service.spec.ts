import { Test, TestingModule } from '@nestjs/testing';
import { AdminAccessLogService } from './admin-access-log.service';

describe('AdminAccessLogService', () => {
  let service: AdminAccessLogService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AdminAccessLogService],
    }).compile();

    service = module.get<AdminAccessLogService>(AdminAccessLogService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
