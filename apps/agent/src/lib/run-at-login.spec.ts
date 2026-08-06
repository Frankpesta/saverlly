import { execFileSync } from 'child_process';
import { ensureRunAtLoginTask, RUN_AT_LOGIN_TASK_NAME } from './run-at-login';

jest.mock('child_process');
const mockExecFileSync = execFileSync as jest.MockedFunction<typeof execFileSync>;

describe('ensureRunAtLoginTask', () => {
  beforeEach(() => {
    mockExecFileSync.mockReset();
  });

  it('creates a SYSTEM-run, highest-privilege, onlogon scheduled task pointed at the exe', () => {
    ensureRunAtLoginTask('C:\\Program Files\\Saverlly\\agent.exe');

    expect(mockExecFileSync).toHaveBeenCalledWith(
      'schtasks',
      [
        '/create',
        '/tn',
        RUN_AT_LOGIN_TASK_NAME,
        '/tr',
        '"C:\\Program Files\\Saverlly\\agent.exe"',
        '/sc',
        'onlogon',
        '/rl',
        'highest',
        '/ru',
        'SYSTEM',
        '/f',
      ],
      { stdio: 'ignore' },
    );
  });

  it('uses /f so re-registration overwrites rather than failing on an already-existing task', () => {
    ensureRunAtLoginTask('C:\\agent.exe');
    const args = mockExecFileSync.mock.calls[0][1] as string[];
    expect(args).toContain('/f');
  });

  it('supports a custom task name for isolated testing', () => {
    ensureRunAtLoginTask('C:\\agent.exe', { taskName: 'CustomTaskName' });
    const args = mockExecFileSync.mock.calls[0][1] as string[];
    expect(args[args.indexOf('/tn') + 1]).toBe('CustomTaskName');
  });
});
