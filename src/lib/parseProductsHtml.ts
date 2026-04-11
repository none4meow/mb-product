import type { Product } from '../types/catalog'

export const UNASSIGNED_LABEL = 'Unassigned'

const BASE_IMAGE_URL = 'https://minhbros.com'

const PRODUCT_ROW_PATTERN =
  /<tr>\s*<td><a data-toggle="collapse"[\s\S]*?<\/td>\s*<td>(?<imageCell>[\s\S]*?)<\/td>\s*<td style="vertical-align: middle;">(?<name>[\s\S]*?)<\/td>\s*<td style="vertical-align: middle;">(?<sku>[\s\S]*?)<\/td>\s*<td style="vertical-align: middle;">(?<type>[\s\S]*?)<\/td>\s*<td style="vertical-align: middle;">(?<hsName>[\s\S]*?)<\/td>\s*<td style="vertical-align: middle;">(?<hsCode>[\s\S]*?)<\/td>\s*<td style="vertical-align: middle;">(?<category>[\s\S]*?)<\/td>\s*<td>[\s\S]*?<\/td>\s*<td class="text-center"[\s\S]*?<\/td>\s*<\/tr>/g

const IMAGE_PATH_PATTERN =
  /(?:href|data-src|src)="(?<path>https?:\/\/[^"]+|\/upload\/[^"]+)"/g
const PRODUCT_ID_PATTERN = /\/edit-product\/(?<id>\d+)/
const HTML_TAG_PATTERN = /<[^>]+>/g
const HTML_ENTITY_PATTERN = /&(#x?[0-9a-f]+|[a-z]+);/gi

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
}

function decodeHtmlEntities(value: string) {
  return value.replace(HTML_ENTITY_PATTERN, (_, entity: string) => {
    const normalizedEntity = entity.toLowerCase()

    if (normalizedEntity.startsWith('#x')) {
      return String.fromCodePoint(Number.parseInt(normalizedEntity.slice(2), 16))
    }

    if (normalizedEntity.startsWith('#')) {
      return String.fromCodePoint(Number.parseInt(normalizedEntity.slice(1), 10))
    }

    return NAMED_ENTITIES[normalizedEntity] ?? `&${entity};`
  })
}

function stripMarkup(value: string) {
  return value.replace(HTML_TAG_PATTERN, ' ')
}

function cleanText(value: string) {
  return decodeHtmlEntities(stripMarkup(value)).replace(/\s+/g, ' ').trim()
}

function normalizeFacetValue(value: string) {
  const cleanedValue = cleanText(value)
  return cleanedValue || UNASSIGNED_LABEL
}

function getFallbackProductId(rowHtml: string) {
  return rowHtml.match(PRODUCT_ID_PATTERN)?.groups?.id ?? ''
}

function normalizeSku(value: string, rowHtml: string) {
  const cleanedValue = cleanText(value)

  if (cleanedValue) {
    return cleanedValue
  }

  const fallbackProductId = getFallbackProductId(rowHtml)
  return fallbackProductId ? `MISSING-SKU-${fallbackProductId}` : ''
}

function normalizeName(value: string, rowHtml: string) {
  const cleanedValue = cleanText(value)

  if (cleanedValue) {
    return cleanedValue
  }

  const fallbackProductId = getFallbackProductId(rowHtml)
  return fallbackProductId ? `Untitled product ${fallbackProductId}` : 'Untitled product'
}

function normalizeImageUrl(imageCell: string) {
  const imageMatch = Array.from(imageCell.matchAll(IMAGE_PATH_PATTERN)).find((match) =>
    Boolean(match.groups?.path),
  )

  const matchedPath = imageMatch?.groups?.path

  if (!matchedPath) {
    return `${BASE_IMAGE_URL}/upload/product/placeholder.jpg`
  }

  return matchedPath.startsWith('http') ? matchedPath : `${BASE_IMAGE_URL}${matchedPath}`
}

export function dedupeProductsBySku(products: Product[]) {
  const productMap = new Map<string, Product>()

  for (const product of products) {
    productMap.set(product.sku, product)
  }

  return Array.from(productMap.values())
}

export function parseProductsHtml(html: string, sourceLabel: string): Product[] {
  const products: Product[] = []

  for (const match of html.matchAll(PRODUCT_ROW_PATTERN)) {
    const rowHtml = match[0]
    const sku = normalizeSku(match.groups?.sku ?? '', rowHtml)

    if (!sku) {
      continue
    }

    products.push({
      sku,
      name: normalizeName(match.groups?.name ?? '', rowHtml),
      type: normalizeFacetValue(match.groups?.type ?? ''),
      hsName: normalizeFacetValue(match.groups?.hsName ?? ''),
      hsCode: cleanText(match.groups?.hsCode ?? ''),
      category: normalizeFacetValue(match.groups?.category ?? ''),
      imageUrl: normalizeImageUrl(match.groups?.imageCell ?? ''),
      sourceLabel,
    })
  }

  return dedupeProductsBySku(products)
}
