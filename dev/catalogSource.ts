import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { UNASSIGNED_LABEL, parseProductsHtml } from '../src/lib/parseProductsHtml'
import type { Product } from '../src/types/catalog'
import type {
  ApplyImportRequest,
  CatalogResponse,
  ImportPreviewRequest,
  ImportPreviewResponse,
  UpdateCatalogProductRequest,
  UpdateCatalogProductResponse,
} from '../src/types/catalogSourceApi'

const FALLBACK_IMAGE_URL = 'https://minhbros.com/upload/product/placeholder.jpg'
const SOURCE_FILE_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../src/data/products.initial.json',
)

export class CatalogSourceError extends Error {
  readonly status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = 'CatalogSourceError'
    this.status = status
  }
}

function cloneProduct(product: Product): Product {
  return {
    ...product,
    imageUrls: [...product.imageUrls],
  }
}

function normalizeImageUrls(imageUrls: string[]) {
  const nextImageUrls: string[] = []
  const seenImageUrls = new Set<string>()

  for (const imageUrl of imageUrls) {
    const trimmedImageUrl = imageUrl.trim()

    if (!trimmedImageUrl || seenImageUrls.has(trimmedImageUrl)) {
      continue
    }

    seenImageUrls.add(trimmedImageUrl)
    nextImageUrls.push(trimmedImageUrl)
  }

  return nextImageUrls.length > 0 ? nextImageUrls : [FALLBACK_IMAGE_URL]
}

function normalizeEditableProduct(product: Product): Product {
  const sku = product.sku.trim()

  if (!sku) {
    throw new CatalogSourceError('SKU is required before saving to products.initial.json.')
  }

  return {
    sku,
    name: product.name.trim() || 'Untitled product',
    type: product.type.trim() || UNASSIGNED_LABEL,
    hsName: product.hsName.trim() || UNASSIGNED_LABEL,
    hsCode: product.hsCode.trim(),
    category: product.category.trim() || UNASSIGNED_LABEL,
    imageUrls: normalizeImageUrls(product.imageUrls),
    sourceLabel: product.sourceLabel.trim() || 'Manual edit',
  }
}

function collectImportSources(request: ImportPreviewRequest) {
  const sources: Array<{ name: string; html: string }> = []

  if (request.pastedHtml?.trim()) {
    sources.push({
      name: 'Pasted HTML',
      html: request.pastedHtml,
    })
  }

  for (const uploadedSource of request.uploadedSources ?? []) {
    if (!uploadedSource.html.trim()) {
      sources.push(uploadedSource)
      continue
    }

    sources.push(uploadedSource)
  }

  return sources
}

export async function readCatalogSourceFile() {
  const sourceContents = await readFile(SOURCE_FILE_PATH, 'utf8')
  return JSON.parse(sourceContents) as Product[]
}

export async function writeCatalogSourceFile(products: Product[]) {
  await writeFile(SOURCE_FILE_PATH, `${JSON.stringify(products, null, 2)}\n`, 'utf8')
}

export function buildImportPreview(
  currentProducts: Product[],
  request: ImportPreviewRequest,
): ImportPreviewResponse {
  const nextProducts: Product[] = []
  const duplicateCandidates: ImportPreviewResponse['duplicateCandidates'] = []
  const invalidSources: string[] = []
  const existingProductsBySku = new Map(
    currentProducts.map((product) => [product.sku, cloneProduct(product)]),
  )
  const seenPreviewSkus = new Set<string>()

  for (const source of collectImportSources(request)) {
    const parsedProducts = parseProductsHtml(source.html, source.name)

    if (parsedProducts.length === 0) {
      invalidSources.push(source.name)
      continue
    }

    for (const parsedProduct of parsedProducts) {
      if (seenPreviewSkus.has(parsedProduct.sku)) {
        continue
      }

      seenPreviewSkus.add(parsedProduct.sku)

      const existingProduct = existingProductsBySku.get(parsedProduct.sku)

      if (existingProduct) {
        duplicateCandidates.push({
          sku: parsedProduct.sku,
          existing: existingProduct,
          incoming: cloneProduct(parsedProduct),
        })
        continue
      }

      nextProducts.push(cloneProduct(parsedProduct))
    }
  }

  return {
    newProducts: nextProducts,
    duplicateCandidates,
    invalidSources,
  }
}

export function applyImportToCatalog(currentProducts: Product[], request: ApplyImportRequest) {
  const nextProducts = currentProducts.map(cloneProduct)
  const existingProductsBySku = new Map(
    nextProducts.map((product, index) => [product.sku, index]),
  )

  for (const duplicateUpdate of request.duplicateUpdates) {
    const duplicateIndex = existingProductsBySku.get(duplicateUpdate.sku)

    if (duplicateIndex === undefined) {
      continue
    }

    nextProducts[duplicateIndex] = normalizeEditableProduct(duplicateUpdate)
  }

  for (const newProduct of request.newProducts) {
    if (existingProductsBySku.has(newProduct.sku)) {
      continue
    }

    const normalizedNewProduct = normalizeEditableProduct(newProduct)
    existingProductsBySku.set(normalizedNewProduct.sku, nextProducts.length)
    nextProducts.push(normalizedNewProduct)
  }

  return nextProducts
}

export function updateCatalogProductInSource(
  currentProducts: Product[],
  request: UpdateCatalogProductRequest,
) {
  const productIndex = currentProducts.findIndex(
    (product) => product.sku === request.originalSku,
  )

  if (productIndex === -1) {
    throw new CatalogSourceError(
      `Product ${request.originalSku} no longer exists in products.initial.json.`,
      404,
    )
  }

  const nextProduct = normalizeEditableProduct(request.product)
  const collidingProduct = currentProducts.find(
    (product, index) => index !== productIndex && product.sku === nextProduct.sku,
  )

  if (collidingProduct) {
    throw new CatalogSourceError(
      `SKU ${nextProduct.sku} already exists in products.initial.json.`,
      409,
    )
  }

  const nextProducts = currentProducts.map(cloneProduct)
  nextProducts[productIndex] = nextProduct
  return nextProducts
}

export async function getCatalogResponse(): Promise<CatalogResponse> {
  return {
    products: await readCatalogSourceFile(),
  }
}

export async function previewImportAgainstSource(
  request: ImportPreviewRequest,
): Promise<ImportPreviewResponse> {
  const currentProducts = await readCatalogSourceFile()
  return buildImportPreview(currentProducts, request)
}

export async function applyImportToSource(
  request: ApplyImportRequest,
): Promise<CatalogResponse> {
  const currentProducts = await readCatalogSourceFile()
  const nextProducts = applyImportToCatalog(currentProducts, request)
  await writeCatalogSourceFile(nextProducts)

  return {
    products: nextProducts,
  }
}

export async function updateProductInSource(
  request: UpdateCatalogProductRequest,
): Promise<UpdateCatalogProductResponse> {
  const currentProducts = await readCatalogSourceFile()
  const nextProducts = updateCatalogProductInSource(currentProducts, request)
  const nextProduct = nextProducts.find((product) => product.sku === request.product.sku.trim())

  await writeCatalogSourceFile(nextProducts)

  return {
    products: nextProducts,
    product: nextProduct ?? nextProducts[0],
  }
}
