import { Injectable } from '@nestjs/common';
import { ErrorCode } from '../../common/constants/error-codes';
import { Errors } from '../../common/exceptions/app.exception';
import { AuthUser } from '../../common/types/request.types';
import { PrismaService, Tx } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { decodeCursor, toPage } from '../../utils/helpers/pagination.util';
import { AccessService } from '../core/access.service';
import { CreateProductInput, UpdateProductInput, createProductSchema, productsQuerySchema, slugify, updateProductSchema } from './products.schemas';

const include = { features: { orderBy: { order_index: 'asc' as const } } };
type ProductRow = Prisma.productsGetPayload<{ include: typeof include }>;

/** Katalog produk per workspace (DSH-V1-02). Dibaca MCP lewat view `mcp_products_v`. */
@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  async list(user: AuthUser, workspaceId: string, raw: unknown) {
    await this.access.assertWorkspace(user.id, workspaceId);
    const query = productsQuerySchema.parse(raw);
    const offset = decodeCursor(query.cursor);
    const rows = await this.prisma.products.findMany({
      where: {
        workspace_id: workspaceId,
        deleted_at: null,
        ...(query.status ? { status: query.status } : {}),
        ...(query.q ? { name: { contains: query.q, mode: 'insensitive' as const } } : {}),
      },
      include,
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
      skip: offset,
      take: query.limit + 1,
    });
    return toPage(rows.map(toDto), offset, query.limit);
  }

  async get(user: AuthUser, workspaceId: string, id: string) {
    await this.access.assertWorkspace(user.id, workspaceId);
    return toDto(await this.find(workspaceId, id));
  }

  async create(user: AuthUser, workspaceId: string, raw: unknown) {
    await this.access.assertPermission(user.id, workspaceId, 'products:write');
    const input: CreateProductInput = createProductSchema.parse(raw);
    const { features, ...fields } = input;
    const slug = input.slug ?? (await this.freeSlug(workspaceId, slugify(input.name)));
    const id = await this.unique(() =>
      this.prisma.tx(async (tx) => {
        const product = await tx.products.create({ data: { ...fields, slug, workspace_id: workspaceId, created_by: user.id } });
        await this.writeFeatures(tx, product.id, features);
        return product.id;
      }),
    );
    return toDto(await this.find(workspaceId, id));
  }

  async update(user: AuthUser, workspaceId: string, id: string, raw: unknown) {
    await this.access.assertPermission(user.id, workspaceId, 'products:write');
    await this.find(workspaceId, id);
    const input: UpdateProductInput = updateProductSchema.parse(raw);
    const { features, ...fields } = input;
    await this.unique(() =>
      this.prisma.tx(async (tx) => {
        await tx.products.update({ where: { id }, data: fields });
        if (features) await this.writeFeatures(tx, id, features);
      }),
    );
    return toDto(await this.find(workspaceId, id));
  }

  async remove(user: AuthUser, workspaceId: string, id: string): Promise<void> {
    await this.access.assertPermission(user.id, workspaceId, 'products:write');
    await this.find(workspaceId, id);
    const open = await this.prisma.opportunities.count({ where: { product_id: id, deleted_at: null, status: { notIn: ['won', 'lost', 'dropped'] } } });
    if (open > 0) throw Errors.conflict(ErrorCode.BUSINESS_RULE_VIOLATION, `Produk masih punya ${open} opportunity aktif; arsipkan saja`, { open_opportunities: open });
    await this.prisma.products.update({ where: { id }, data: { deleted_at: new Date() } });
  }

  private async writeFeatures(tx: Tx, productId: string, features: CreateProductInput['features']): Promise<void> {
    await tx.product_features.deleteMany({ where: { product_id: productId } });
    if (features.length) await tx.product_features.createMany({ data: features.map((f, i) => ({ ...f, product_id: productId, order_index: i })) });
  }

  private async find(workspaceId: string, id: string): Promise<ProductRow> {
    const product = await this.prisma.products.findFirst({ where: { id, workspace_id: workspaceId, deleted_at: null }, include });
    if (!product) throw Errors.notFound('Produk tidak ditemukan');
    return product;
  }

  private async freeSlug(workspaceId: string, base: string): Promise<string> {
    const taken = new Set(
      (await this.prisma.products.findMany({ where: { workspace_id: workspaceId, deleted_at: null, slug: { startsWith: base } }, select: { slug: true } })).map((p) => p.slug),
    );
    let slug = base;
    for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
    return slug;
  }

  /** Pelanggaran unique (slug per workspace) → 409 yang jelas, bukan 500. */
  private async unique<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw Errors.conflict(ErrorCode.ALREADY_EXISTS, 'Slug produk sudah dipakai di workspace ini');
      throw error;
    }
  }
}

function toDto(p: ProductRow) {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    category: p.category,
    description: p.description,
    value_proposition: p.value_proposition,
    target_notes: p.target_notes,
    price_range: p.price_range,
    deal_value_estimate: p.deal_value_estimate?.toFixed(2) ?? null,
    status: p.status,
    features: p.features.map((f) => ({ id: f.id, name: f.name, description: f.description, benefit: f.benefit, order_index: f.order_index })),
    created_at: p.created_at,
    updated_at: p.updated_at,
  };
}
