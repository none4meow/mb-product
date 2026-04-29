export type Product = {
  sku: string
  name: string
  type: string
  hsName: string
  hsCode: string
  category: string
  imageUrls: string[]
  sourceLabel: string
}

export type FilterState = {
  nameQuery: string
  skuQuery: string
  types: string[]
  hsNames: string[]
  categories: string[]
}
