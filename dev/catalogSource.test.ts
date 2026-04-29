// @vitest-environment node

import { describe, expect, it } from 'vitest'
import type { Product } from '../src/types/catalog'
import {
  CatalogSourceError,
  applyImportToCatalog,
  buildImportPreview,
  updateCatalogProductInSource,
} from './catalogSource'

const currentProducts: Product[] = [
  {
    sku: 'D48',
    name: 'Existing D48',
    type: 'Wood',
    hsName: 'Plywood decorative sign',
    hsCode: '4411939090',
    category: 'Table Decor',
    imageUrls: ['https://minhbros.com/upload/product/example/d48.jpg'],
    sourceLabel: 'Products_Page 1.html',
  },
  {
    sku: 'U40',
    name: 'Existing U40',
    type: 'Macrame + Wood',
    hsName: 'Macrame Wall Hanging',
    hsCode: '5609004000',
    category: 'Wall Hangings',
    imageUrls: ['https://minhbros.com/upload/product/example/u40.jpg'],
    sourceLabel: 'Products_Page 1.html',
  },
]

function renderRow(product: Product, index: number) {
  const imageUrl = product.imageUrls[0]
  const imagePath = imageUrl.replace('https://minhbros.com', '')

  return `
    <tr>
      <td><a data-toggle="collapse" data-target="#product_${index}"></a></td>
      <td><a href="${imagePath}"><img src="${imagePath}"></a></td>
      <td style="vertical-align: middle;">${product.name}</td>
      <td style="vertical-align: middle;">${product.sku}</td>
      <td style="vertical-align: middle;">${product.type}</td>
      <td style="vertical-align: middle;">${product.hsName}</td>
      <td style="vertical-align: middle;">${product.hsCode}</td>
      <td style="vertical-align: middle;">${product.category}</td>
      <td></td>
      <td class="text-center"><a href="/edit-product/${index}">Edit</a></td>
    </tr>
  `
}

function renderTable(products: Product[]) {
  return `<table>${products.map(renderRow).join('')}</table>`
}

describe('catalogSource helpers', () => {
  it('splits preview imports into new SKUs, duplicate SKUs, and invalid sources', () => {
    const preview = buildImportPreview(currentProducts, {
      pastedHtml: renderTable([
        {
          sku: 'NEW-01',
          name: 'New product',
          type: 'Wood',
          hsName: 'Decor',
          hsCode: '1234',
          category: 'Table Decor',
          imageUrls: ['https://minhbros.com/upload/product/example/new-01.jpg'],
          sourceLabel: 'Pasted HTML',
        },
      ]),
      uploadedSources: [
        {
          name: 'Duplicate.html',
          html: renderTable([
            {
              sku: 'D48',
              name: 'Incoming D48',
              type: 'Glass',
              hsName: 'Updated Decor',
              hsCode: '9999',
              category: 'Wall Hangings',
              imageUrls: ['https://minhbros.com/upload/product/example/duplicate-d48.jpg'],
              sourceLabel: 'Duplicate.html',
            },
          ]),
        },
        {
          name: 'Bad.html',
          html: '<html><body>No product rows here</body></html>',
        },
      ],
    })

    expect(preview.newProducts.map((product) => product.sku)).toEqual(['NEW-01'])
    expect(preview.duplicateCandidates).toHaveLength(1)
    expect(preview.duplicateCandidates[0].existing.name).toBe('Existing D48')
    expect(preview.duplicateCandidates[0].incoming.name).toBe('Incoming D48')
    expect(preview.invalidSources).toEqual(['Bad.html'])
  })

  it('appends new SKUs and overwrites selected duplicates in place', () => {
    const nextProducts = applyImportToCatalog(currentProducts, {
      newProducts: [
        {
          sku: 'NEW-02',
          name: 'Brand new',
          type: 'Wood',
          hsName: 'Decor',
          hsCode: '5678',
          category: 'Table Decor',
          imageUrls: ['https://minhbros.com/upload/product/example/new-02.jpg'],
          sourceLabel: 'Upload.html',
        },
      ],
      duplicateUpdates: [
        {
          sku: 'D48',
          name: 'Overwritten D48',
          type: 'Glass',
          hsName: 'Updated Decor',
          hsCode: '9999',
          category: 'Wall Hangings',
          imageUrls: ['https://minhbros.com/upload/product/example/overwritten-d48.jpg'],
          sourceLabel: 'Upload.html',
        },
      ],
    })

    expect(nextProducts).toHaveLength(3)
    expect(nextProducts[0].name).toBe('Overwritten D48')
    expect(nextProducts[1].name).toBe('Existing U40')
    expect(nextProducts[2].sku).toBe('NEW-02')
  })

  it('rejects single-product edits that would collide with another SKU', () => {
    expect(() =>
      updateCatalogProductInSource(currentProducts, {
        originalSku: 'D48',
        product: {
          ...currentProducts[0],
          sku: 'U40',
        },
      }),
    ).toThrowError(CatalogSourceError)

    expect(() =>
      updateCatalogProductInSource(currentProducts, {
        originalSku: 'D48',
        product: {
          ...currentProducts[0],
          sku: 'U40',
        },
      }),
    ).toThrow('SKU U40 already exists')
  })
})
