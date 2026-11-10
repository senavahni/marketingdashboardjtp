/** DSH-V1-02 — aturan & proxy Market Intelligence + Swagger (tanpa DB). */
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { AppException } from '../../src/common/exceptions/app.exception';
import { IntelController } from '../../src/modules/intel/intel.controller';
import { IntelService } from '../../src/modules/intel/intel.service';
import { Jobs13Service } from '../../src/modules/intel/v13/jobs13.service';
import { isJob13Body } from '../../src/modules/intel/v13/jobs13.schemas';
import { ApprovalsService } from '../../src/modules/market-intel/approvals.service';
import { CatalogController } from '../../src/modules/market-intel/catalog.controller';
import { assertContentAction } from '../../src/modules/market-intel/content.schemas';
import { ContentService } from '../../src/modules/market-intel/content.service';
import { ExportsService } from '../../src/modules/market-intel/exports.service';
import { IntelDataController } from '../../src/modules/market-intel/intel-data.controller';
import { IntelProxyService, filterContacts } from '../../src/modules/market-intel/intel-proxy.service';
import { assertOpportunityTransition } from '../../src/modules/market-intel/opportunities.schemas';
import { OpportunitiesService } from '../../src/modules/market-intel/opportunities.service';
import { ProductsService } from '../../src/modules/market-intel/products.service';
import { slugify } from '../../src/modules/market-intel/products.schemas';
import { UploadsService } from '../../src/modules/market-intel/uploads.service';
import { ImportService } from '../../src/modules/market-intel/import.service';
import { KnowledgeService } from '../../src/modules/market-intel/knowledge.service';
import { WorkflowController } from '../../src/modules/market-intel/workflow.controller';
import { companyProfileSchema } from '../../src/shared/schemas/intel-1.3-tools.schema';

const profile = companyProfileSchema.parse(
  (JSON.parse(readFileSync(join(resolve(__dirname, '../../../contracts/1.3/fixtures'), 'valid_company_profile.json'), 'utf8')) as { payload: unknown }).payload,
);
const code = (fn: () => unknown) => {
  try {
    fn();
    return 'OK';
  } catch (e) {
    return (e as AppException).code;
  }
};

describe('filterContacts (V1-K6, AC DSH-V1-02/07)', () => {
  it('member/viewer: kontak personal disembunyikan, jumlahnya dilaporkan', () => {
    for (const role of ['viewer', 'member'] as const) {
      const out = filterContacts(profile, role);
      expect(out.contacts.map((c) => c.contact_type)).toEqual(['generic']);
      expect(out.hidden_personal_contacts).toBe(1);
    }
  });
  it('admin/owner: kontak personal tampil', () => {
    expect(filterContacts(profile, 'admin').contacts).toHaveLength(2);
    expect(filterContacts(profile, 'owner').hidden_personal_contacts).toBe(0);
  });
  it('kontak suppressed tidak pernah tampil, termasuk untuk owner', () => {
    const suppressed = { ...profile, contacts: profile.contacts.map((c) => ({ ...c, suppressed: true })) };
    expect(filterContacts(suppressed, 'owner').contacts).toEqual([]);
  });
});

describe('IntelProxyService', () => {
  const redis = (hit: unknown) => ({ client: { get: jest.fn().mockResolvedValue(hit ? JSON.stringify(hit) : null), set: jest.fn().mockResolvedValue('OK') } });
  const access = (role: string) => ({ assertWorkspace: jest.fn().mockResolvedValue({ role }) });

  it('cache hit tidak memanggil MCP; profil dari cache tetap disaring sesuai peminta', async () => {
    const mcp = { call: jest.fn() };
    const svc = new IntelProxyService(access('member') as never, mcp as never, redis(profile) as never);
    const out = await svc.company({ id: 'u' } as never, '11111111-1111-4111-8111-111111111111', profile.company_id);
    expect(mcp.call).not.toHaveBeenCalled();
    expect(out.hidden_personal_contacts).toBe(1);
  });

  it('cache miss → MCP dengan filter kontrak; hasil disimpan dengan TTL', async () => {
    const page = { items: [], next_cursor: null, total_estimate: 0 };
    const mcp = { call: jest.fn().mockResolvedValue(page) };
    const r = redis(null);
    const svc = new IntelProxyService(access('viewer') as never, mcp as never, r as never);
    await svc.companies({ id: 'u' } as never, '11111111-1111-4111-8111-111111111111', { region_codes: '32,33', org_types: 'education', limit: '20' });
    expect(mcp.call).toHaveBeenCalledWith('ci_company_list', expect.objectContaining({ filter: expect.objectContaining({ region_codes: ['32', '33'], org_types: ['education'] }), limit: 20 }), expect.anything(), undefined);
    expect(r.client.set).toHaveBeenCalledWith(expect.stringMatching(/^mi:ci_company_list:/), JSON.stringify(page), 'EX', 60);
  });
});

describe('aturan workflow', () => {
  it('opportunity: status akhir hanya dibuka ulang ke new/qualified', () => {
    expect(code(() => assertOpportunityTransition('new', 'won'))).toBe('OK');
    expect(code(() => assertOpportunityTransition('won', 'qualified'))).toBe('OK');
    expect(code(() => assertOpportunityTransition('lost', 'proposal'))).toBe('BUSINESS_RULE_VIOLATION');
    expect(code(() => assertOpportunityTransition('meeting', 'meeting'))).toBe('BUSINESS_RULE_VIOLATION');
  });
  it('konten: hanya approved yang bisa dijadwalkan; published tidak bisa diedit', () => {
    expect(code(() => assertContentAction('schedule', 'approved'))).toBe('OK');
    expect(code(() => assertContentAction('schedule', 'draft'))).toBe('BUSINESS_RULE_VIOLATION');
    expect(code(() => assertContentAction('edit', 'published'))).toBe('BUSINESS_RULE_VIOLATION');
    expect(code(() => assertContentAction('publish', 'scheduled'))).toBe('OK');
  });
  it('slugify & deteksi body job 1.3', () => {
    expect(slugify('SIMS — Sistem Informasi Sekolah')).toBe('sims-sistem-informasi-sekolah');
    expect(slugify('***')).toBe('produk');
    expect(isJob13Body({ spec: { kind: 'strategy' } })).toBe(true);
    expect(isJob13Body({ spec: { title: 'x', sources: [] } })).toBe(false);
  });
});

@Module({
  controllers: [CatalogController, IntelDataController, IntelController, WorkflowController],
  providers: [ProductsService, OpportunitiesService, ContentService, ApprovalsService, IntelProxyService, UploadsService, ExportsService, IntelService, Jobs13Service, ImportService, KnowledgeService].map((provide) => ({ provide, useValue: {} })),
})
class MarketIntelSwaggerModule {}

describe('Swagger v1.0.0', () => {
  it('semua endpoint baru terdokumentasi', async () => {
    const app = await NestFactory.create(MarketIntelSwaggerModule, { logger: false });
    try {
      app.setGlobalPrefix('api/v1');
      const doc = SwaggerModule.createDocument(app, new DocumentBuilder().addBearerAuth().build());
      const ws = '/api/v1/workspaces/{ws}';
      for (const path of [
        'products',
        'products/{id}',
        'opportunities',
        'opportunities/{id}',
        'opportunities/{id}/events',
        'strategies',
        'content-items',
        'content-items/{id}/schedule',
        'content-items/decisions',
        'approvals',
        'approvals/{id}/decision',
        'mi/kpis',
        'ci/companies',
        'ci/companies/{companyId}',
        'ci/geo-clusters',
        'opp/scores',
        'opp/explain',
        'kn/assets',
        'uploads',
        'exports',
        'exports/{exportId}',
        'intel/jobs',
        'intel/jobs/{id}/review',
        'intel/jobs/{id}/resume',
        'uploads/{uploadId}/profile',
        'ci/imports',
        'ci/imports/{batchId}/rows/{rowId}/decision',
        'ci/imports/{batchId}/rollback',
        'ci/contact-targets',
        'ci/contact-targets/{targetId}',
        'kn/search',
        'kn/cards/decisions',
        'kn/doctrines/{role}/decision',
        'kn/playbooks/{id}/versions',
        'kn/playbooks/{id}/runs',
        'kg/graph',
        'kg/nodes/{nodeId}/neighbors',
      ]) {
        expect(doc.paths).toHaveProperty(`${ws}/${path}`);
      }
      const create = doc.paths[`${ws}/intel/jobs`]?.post?.requestBody as { content: Record<string, { schema: { anyOf?: unknown[] } }> };
      expect(create.content['application/json'].schema.anyOf).toHaveLength(2);
    } finally {
      await app.close();
    }
  });
});
