import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { UNASSIGNED_LABEL, parseProductsHtml } from './parseProductsHtml'

const downloadFixturePaths = [1, 2, 3, 4].map((pageNumber) =>
  join(homedir(), 'Downloads', `Products_Page ${pageNumber}.html`),
)

async function loadProvidedExports() {
  const pages: string[] = await Promise.all(
    downloadFixturePaths.map((filePath) => readFile(filePath, 'utf8')),
  )

  return pages.flatMap((pageHtml: string, index: number) =>
    parseProductsHtml(pageHtml, `Products_Page ${index + 1}.html`),
  )
}

describe('parseProductsHtml', () => {
  it('parses the four provided exports into 1573 unique products', async () => {
    const products = await loadProvidedExports()

    expect(products).toHaveLength(1573)
    expect(new Set(products.map((product: { sku: string }) => product.sku)).size).toBe(1573)
  })

  it('keeps Vietnamese text intact and builds absolute image URLs', async () => {
    const [firstPageHtml] = await Promise.all([readFile(downloadFixturePaths[0], 'utf8')])
    const products = parseProductsHtml(firstPageHtml, 'Products_Page 1.html')

    expect(products[0]).toMatchObject({
      name: 'Tranh mảnh ghép 2 tầng D48',
      sku: 'D48',
      imageUrl:
        'https://minhbros.com/upload/product/1654/9d2682367c3935defcb1f9e247a97c0d69d86c3e469c7.jpg',
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
        imageUrl: 'https://minhbros.com/upload/product/example/item.jpg',
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
        imageUrl: 'https://minhbros.com/upload/order_item/51197.jpg',
        sourceLabel: 'fixture',
      },
    ])
  })
})
