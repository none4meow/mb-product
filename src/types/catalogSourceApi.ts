import type { Product } from './catalog'

export type UploadedHtmlSource = {
  name: string
  html: string
}

export type ImportPreviewRequest = {
  pastedHtml?: string
  uploadedSources?: UploadedHtmlSource[]
}

export type DuplicateCandidate = {
  sku: string
  existing: Product
  incoming: Product
}

export type ImportPreviewResponse = {
  newProducts: Product[]
  duplicateCandidates: DuplicateCandidate[]
  invalidSources: string[]
}

export type ApplyImportRequest = {
  newProducts: Product[]
  duplicateUpdates: Product[]
}

export type CatalogResponse = {
  products: Product[]
}

export type UpdateCatalogProductRequest = {
  originalSku: string
  product: Product
}

export type UpdateCatalogProductResponse = {
  products: Product[]
  product: Product
}
