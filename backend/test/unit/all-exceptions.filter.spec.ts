import { ArgumentsHost } from '@nestjs/common';
import { z } from 'zod';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';

function run(exception: unknown) {
  const json = jest.fn();
  const res = { status: jest.fn().mockReturnValue({ json }), setHeader: jest.fn() };
  const host = {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => ({ id: 'req-1', url: '/x' }), getResponse: () => res }),
  } as unknown as ArgumentsHost;
  new AllExceptionsFilter().catch(exception, host);
  return { status: res.status.mock.calls[0][0] as number, body: json.mock.calls[0][0] };
}

describe('AllExceptionsFilter', () => {
  it('memetakan ZodError dari service ke 400 VALIDATION_ERROR dengan detail per field', () => {
    const result = z.object({ limit: z.number().max(200) }).safeParse({ limit: 500 });
    if (result.success) throw new Error('schema seharusnya menolak input');

    const { status, body } = run(result.error);

    expect(status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details.issues[0].path).toBe('limit');
  });

  it('error tak dikenal tetap 500 tanpa membocorkan detail', () => {
    const { status, body } = run(new Error('rahasia'));

    expect(status).toBe(500);
    expect(JSON.stringify(body)).not.toContain('rahasia');
  });
});
