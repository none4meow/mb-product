import { describe, expect, it } from 'vitest'
import seedProducts from '../data/products.initial.json'
import type { Product } from '../types/catalog'
import { UNASSIGNED_LABEL, parseProductsHtml } from './parseProductsHtml'

const seedCatalog = seedProducts as Product[]
const PRODUCTS_PER_EXPORT = Math.ceil(seedCatalog.length / 4)

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function toFixtureImagePath(imageUrl: string) {
  return imageUrl.startsWith('https://minhbros.com')
    ? imageUrl.replace('https://minhbros.com', '')
    : imageUrl
}

function renderProductRow(product: Product, index: number) {
  const primaryImageUrl = product.imageUrls[0] ?? ''
  const imagePath = escapeHtml(toFixtureImagePath(primaryImageUrl))

  return `
    <tr>
      <td><a data-toggle="collapse" data-target="#product_${index + 1}"></a></td>
      <td>
        <a href="${imagePath}"><img src="${imagePath}"></a>
      </td>
      <td style="vertical-align: middle;">${escapeHtml(product.name)}</td>
      <td style="vertical-align: middle;">${escapeHtml(product.sku)}</td>
      <td style="vertical-align: middle;">${escapeHtml(product.type)}</td>
      <td style="vertical-align: middle;">${escapeHtml(product.hsName)}</td>
      <td style="vertical-align: middle;">${escapeHtml(product.hsCode)}</td>
      <td style="vertical-align: middle;">${escapeHtml(product.category)}</td>
      <td></td>
      <td class="text-center"><a href="/edit-product/${index + 1}">Edit</a></td>
    </tr>
  `
}

function renderProductTable(products: Product[], offset: number) {
  return `
    <table>
      ${products.map((product, index) => renderProductRow(product, offset + index)).join('\n')}
    </table>
  `
}

async function loadProvidedExports() {
  const pages = Array.from({ length: 4 }, (_, pageIndex) =>
    renderProductTable(
      seedCatalog.slice(
        pageIndex * PRODUCTS_PER_EXPORT,
        (pageIndex + 1) * PRODUCTS_PER_EXPORT,
      ),
      pageIndex * PRODUCTS_PER_EXPORT,
    ),
  )

  return pages.flatMap((pageHtml, index) =>
    parseProductsHtml(pageHtml, `Products_Page ${index + 1}.html`),
  )
}

describe('parseProductsHtml', () => {
  it('parses the generated exports into 1573 unique products', async () => {
    const products = await loadProvidedExports()

    expect(products).toHaveLength(1573)
    expect(new Set(products.map((product) => product.sku)).size).toBe(1573)
  })

  it('collects unique image URLs from the image cell in source order', () => {
    const fixtureHtml = `
      <table>
        <tr>
          <td><a data-toggle="collapse" data-target="#product_1"></a></td>
          <td>
            <a href="/upload/product/mock/import-1.jpg">
              <img src="/upload/product/mock/import-2.jpg">
              <img data-src="/upload/product/mock/import-1.jpg">
            </a>
          </td>
          <td style="vertical-align: middle;">Tranh mảnh ghép 2 tầng D48</td>
          <td style="vertical-align: middle;">D48</td>
          <td style="vertical-align: middle;">Wood</td>
          <td style="vertical-align: middle;">Plywood decorative sign</td>
          <td style="vertical-align: middle;">4411939090</td>
          <td style="vertical-align: middle;">Table Decor</td>
          <td></td>
          <td class="text-center"><a href="/edit-product/1">Edit</a></td>
        </tr>
      </table>
    `
    const products = parseProductsHtml(fixtureHtml, 'Products_Page 1.html')

    expect(products[0]).toMatchObject({
      name: 'Tranh mảnh ghép 2 tầng D48',
      sku: 'D48',
      imageUrls: [
        'https://minhbros.com/upload/product/mock/import-1.jpg',
        'https://minhbros.com/upload/product/mock/import-2.jpg',
      ],
    })
  })

  it('decodes HTML entities and normalizes blank categorical fields', () => {
    const html = `
      <table>
        <tr>
          <td><a data-toggle="collapse" data-target="#product_1"></a></td>
          <td>
            <a href="/upload/product/example/item.jpg"><img src="/upload/product/example/item.jpg"></a>
          </td>
          <td style="vertical-align: middle;">Kệ &amp; Hộp treo</td>
          <td style="vertical-align: middle;">TEST-01</td>
          <td style="vertical-align: middle;"></td>
          <td style="vertical-align: middle;"></td>
          <td style="vertical-align: middle;">1234</td>
          <td style="vertical-align: middle;"></td>
          <td></td>
          <td class="text-center"><a href="/edit-product/1">Edit</a></td>
        </tr>
      </table>
    `

    expect(parseProductsHtml(html, 'fixture')).toEqual([
      {
        sku: 'TEST-01',
        name: 'Kệ & Hộp treo',
        type: UNASSIGNED_LABEL,
        hsName: UNASSIGNED_LABEL,
        hsCode: '1234',
        category: UNASSIGNED_LABEL,
        imageUrls: ['https://minhbros.com/upload/product/example/item.jpg'],
        sourceLabel: 'fixture',
      },
    ])
  })

  it('uses a placeholder image when the row has no image URLs', () => {
    const html = `
      <table>
        <tr>
          <td><a data-toggle="collapse" data-target="#product_8"></a></td>
          <td><span>No image available</span></td>
          <td style="vertical-align: middle;">Placeholder product</td>
          <td style="vertical-align: middle;">PLACEHOLDER-01</td>
          <td style="vertical-align: middle;">Wood</td>
          <td style="vertical-align: middle;">Decor</td>
          <td style="vertical-align: middle;">1111</td>
          <td style="vertical-align: middle;">Table Decor</td>
          <td></td>
          <td class="text-center"><a href="/edit-product/8">Edit</a></td>
        </tr>
      </table>
    `

    expect(parseProductsHtml(html, 'fixture')).toEqual([
      {
        sku: 'PLACEHOLDER-01',
        name: 'Placeholder product',
        type: 'Wood',
        hsName: 'Decor',
        hsCode: '1111',
        category: 'Table Decor',
        imageUrls: ['https://minhbros.com/upload/product/placeholder.jpg'],
        sourceLabel: 'fixture',
      },
    ])
  })

  it('creates stable fallback identifiers when a row is missing SKU and name', () => {
    const html = `
      <table>
        <tr>
          <td><a data-toggle="collapse" data-target="#product_9"></a></td>
          <td>
            <a href="https://minhbros.com/upload/order_item/51197.jpg"><img src="https://minhbros.com/upload/order_item/51197.jpg"></a>
          </td>
          <td style="vertical-align: middle;"></td>
          <td style="vertical-align: middle;"></td>
          <td style="vertical-align: middle;"></td>
          <td style="vertical-align: middle;"></td>
          <td style="vertical-align: middle;"></td>
          <td style="vertical-align: middle;"></td>
          <td></td>
          <td class="text-center"><a href="/edit-product/1022">Edit</a></td>
        </tr>
      </table>
    `

    expect(parseProductsHtml(html, 'fixture')).toEqual([
      {
        sku: 'MISSING-SKU-1022',
        name: 'Untitled product 1022',
        type: UNASSIGNED_LABEL,
        hsName: UNASSIGNED_LABEL,
        hsCode: '',
        category: UNASSIGNED_LABEL,
        imageUrls: ['https://minhbros.com/upload/order_item/51197.jpg'],
        sourceLabel: 'fixture',
      },
    ])
  })

  it('keeps the first row when a later row has the same SKU', () => {
    const html = `
      <table>
        <tr>
          <td><a data-toggle="collapse" data-target="#product_10"></a></td>
          <td>
            <a href="/upload/product/example/first.jpg"><img src="/upload/product/example/first.jpg"></a>
          </td>
          <td style="vertical-align: middle;">First product</td>
          <td style="vertical-align: middle;">DUP-01</td>
          <td style="vertical-align: middle;">Wood</td>
          <td style="vertical-align: middle;">Decor</td>
          <td style="vertical-align: middle;">1111</td>
          <td style="vertical-align: middle;">Table Decor</td>
          <td></td>
          <td class="text-center"><a href="/edit-product/10">Edit</a></td>
        </tr>
        <tr>
          <td><a data-toggle="collapse" data-target="#product_11"></a></td>
          <td>
            <a href="/upload/product/example/second.jpg"><img src="/upload/product/example/second.jpg"></a>
          </td>
          <td style="vertical-align: middle;">Second product</td>
          <td style="vertical-align: middle;">DUP-01</td>
          <td style="vertical-align: middle;">Glass</td>
          <td style="vertical-align: middle;">Alt Decor</td>
          <td style="vertical-align: middle;">2222</td>
          <td style="vertical-align: middle;">Wall Hangings</td>
          <td></td>
          <td class="text-center"><a href="/edit-product/11">Edit</a></td>
        </tr>
      </table>
    `

    expect(parseProductsHtml(html, 'fixture')).toEqual([
      {
        sku: 'DUP-01',
        name: 'First product',
        type: 'Wood',
        hsName: 'Decor',
        hsCode: '1111',
        category: 'Table Decor',
        imageUrls: ['https://minhbros.com/upload/product/example/first.jpg'],
        sourceLabel: 'fixture',
      },
    ])
  })
})
