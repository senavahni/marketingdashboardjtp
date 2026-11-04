import { HttpStatus } from '@nestjs/common';
import { ErrorCode, ErrorCodeValue } from '../../common/constants/error-codes';
import { AppException } from '../../common/exceptions/app.exception';
import { McpCallError } from '../agent-runs/mcp-client.service';

const MCP_MESSAGES: Record<string, string> = {
  MCP_UNAVAILABLE: 'Layanan MCP tidak tersedia',
  UNKNOWN_AGENT: 'Agent tidak dikenal oleh layanan MCP',
  AGENT_INACTIVE: 'Agent tidak aktif',
  AGENT_NOT_CAPABLE: 'Agent tidak memiliki kapabilitas yang diperlukan',
  COST_CONFIRMATION_REQUIRED: 'Konfirmasi biaya diperlukan',
  NOT_FOUND: 'Data tidak ditemukan di layanan MCP',
  RESULT_EXPIRED: 'Masa penyimpanan hasil telah berakhir',
  JOB_NOT_ACTIVE: 'Job tidak sedang berjalan',
  VALIDATION_ERROR: 'Permintaan ditolak oleh layanan MCP',
  SOURCE_UNAVAILABLE: 'Sumber data tidak tersedia',
  RATE_LIMITED: 'Batas permintaan MCP tercapai',
};

const MCP_ERRORS: Record<string, { code: ErrorCodeValue; status: number }> = {
  MCP_UNAVAILABLE: { code: ErrorCode.MCP_UNAVAILABLE, status: HttpStatus.BAD_GATEWAY },
  MCP_ERROR: { code: ErrorCode.MCP_ERROR, status: HttpStatus.BAD_GATEWAY },
  INTERNAL: { code: ErrorCode.MCP_ERROR, status: HttpStatus.BAD_GATEWAY },
  UNKNOWN_AGENT: { code: ErrorCode.UNKNOWN_AGENT, status: HttpStatus.UNPROCESSABLE_ENTITY },
  AGENT_INACTIVE: { code: ErrorCode.AGENT_INACTIVE, status: HttpStatus.UNPROCESSABLE_ENTITY },
  AGENT_NOT_CAPABLE: { code: ErrorCode.AGENT_NOT_CAPABLE, status: HttpStatus.UNPROCESSABLE_ENTITY },
  COST_CONFIRMATION_REQUIRED: { code: ErrorCode.COST_CONFIRMATION_REQUIRED, status: HttpStatus.UNPROCESSABLE_ENTITY },
  VALIDATION_ERROR: { code: ErrorCode.VALIDATION_ERROR, status: HttpStatus.BAD_REQUEST },
  SOURCE_UNAVAILABLE: { code: ErrorCode.SOURCE_UNAVAILABLE, status: HttpStatus.UNPROCESSABLE_ENTITY },
  RATE_LIMITED: { code: ErrorCode.RATE_LIMITED, status: HttpStatus.TOO_MANY_REQUESTS },
  NOT_FOUND: { code: ErrorCode.NOT_FOUND, status: HttpStatus.NOT_FOUND },
  RESULT_EXPIRED: { code: ErrorCode.RESULT_EXPIRED, status: HttpStatus.GONE },
  JOB_NOT_ACTIVE: { code: ErrorCode.JOB_NOT_ACTIVE, status: HttpStatus.CONFLICT },
};

export function mapIntelMcpError(error: McpCallError): AppException {
  const mapped = MCP_ERRORS[error.code] ?? { code: ErrorCode.MCP_ERROR, status: HttpStatus.BAD_GATEWAY };
  const message = MCP_MESSAGES[error.code] ?? 'Layanan MCP gagal memproses permintaan';
  return new AppException(mapped.code, message, mapped.status);
}
