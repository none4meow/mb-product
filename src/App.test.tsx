import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Product } from './types/catalog'
import type {
  ApplyImportRequest,
  CatalogResponse,
  ImportPreviewRequest,
  ImportPreviewResponse,
  UpdateCatalogProductRequest,
  UpdateCatalogProductResponse,
} from './types/catalogSourceApi'

const { seedProducts } = vi.hoisted(() => ({
  seedProducts: [
    {
      sku: 'D48',
      name: 'Tranh manh ghep 2 tang D48',
      type: 'Wood',
      hsName: 'Plywood decorative sign',
      hsCode: '4411939090',
      category: 'Table Decor',
      imageUrls: [
        'https://minhbros.com/upload/product/mock/d48-1.jpg',
        'https://minhbros.com/upload/product/mock/d48-2.jpg',
      ],
      sourceLabel: 'Products_Page 1.html',
    },
    {
      sku: 'U40',
      name: 'Treo Mong Ngua U40',
      type: 'Macrame + Wood',
      hsName: 'Macrame Wall Hanging',
      hsCode: '5609004000',
      category: 'Wall Hangings',
      imageUrls: ['https://minhbros.com/upload/product/mock/u40-1.jpg'],
      sourceLabel: 'Products_Page 1.html',
    },
  ] satisfies Product[],
}))

vi.mock('./data/products.initial.json', () => ({
  default: seedProducts,
}))

import App from './App'

function createCatalogApiMock(overrides?: {
  previewImport?: (request: ImportPreviewRequest) => Promise<ImportPreviewResponse>
  applyImport?: (request: ApplyImportRequest) => Promise<CatalogResponse>
  updateProduct?: (request: UpdateCatalogProductRequest) => Promise<UpdateCatalogProductResponse>
}) {
  return {
    previewImport: vi
      .fn<(request: ImportPreviewRequest) => Promise<ImportPreviewResponse>>()
      .mockImplementation(
        overrides?.previewImport ??
          (async () => ({
            newProducts: [],
            duplicateCandidates: [],
            invalidSources: [],
          })),
      ),
    applyImport: vi
      .fn<(request: ApplyImportRequest) => Promise<CatalogResponse>>()
      .mockImplementation(
        overrides?.applyImport ??
          (async () => ({
            products: seedProducts,
          })),
      ),
    updateProduct: vi
      .fn<(request: UpdateCatalogProductRequest) => Promise<UpdateCatalogProductResponse>>()
      .mockImplementation(
        overrides?.updateProduct ??
          (async (request) => ({
            products: seedProducts,
            product: request.product,
          })),
      ),
  }
}

function setWindowScrollY(value: number) {
  Object.defineProperty(window, 'scrollY', {
    configurable: true,
    writable: true,
    value,
  })
}

async function openAdvancedSearch(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /show advanced search/i }))
}

async function expandCatalogInfo(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /show catalog summary and actions/i }))
}

async function openLocalSource(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /show local source/i }))
}

describe('App', () => {
  beforeEach(() => {
    setWindowScrollY(0)
  })

  it('keeps the catalog summary collapsed by default and toggles it with one shared control', async () => {
    const user = userEvent.setup()

    render(<App />)

    expect(screen.queryByText('Minh & Brothers Product Index')).not.toBeInTheDocument()
    expect(screen.queryByText('Active catalog')).not.toBeInTheDocument()

    const toggle = screen.getByRole('button', { name: /show catalog summary and actions/i })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    await user.click(toggle)

    expect(screen.getByRole('button', { name: /hide catalog summary and actions/i })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    expect(screen.getByText('Minh & Brothers Product Index')).toBeInTheDocument()
    expect(screen.getByText('Active catalog')).toBeInTheDocument()
  })

  it('keeps Local Source collapsed by default and reveals the source inputs only after expanding it', async () => {
    const user = userEvent.setup()

    render(<App />)
    await expandCatalogInfo(user)

    expect(screen.queryByRole('button', { name: 'Update Catalog' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reset to Seed Data' })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Catalog source editor' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /show local source/i })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    expect(screen.queryByLabelText('Paste HTML')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Upload HTML Files')).not.toBeInTheDocument()

    await openLocalSource(user)

    expect(screen.getByRole('button', { name: /hide local source/i })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    expect(screen.getByLabelText('Paste HTML')).toBeInTheDocument()
    expect(screen.getByLabelText('Upload HTML Files')).toBeInTheDocument()
  })

  it('renders Clear Filters inside the filter section and keeps advanced-only fields hidden by default', async () => {
    const user = userEvent.setup()

    render(<App />)

    const filtersPanel = screen.getByRole('region', { name: 'Product filters' })
    expect(within(filtersPanel).getByRole('button', { name: 'Clear Filters' })).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Search by product name')).not.toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('Search by SKU'), {
      target: { value: 'NOT-A-REAL-SKU' },
    })
    expect(screen.getByText('No products match the current filters.')).toHaveAttribute(
      'colspan',
      '4',
    )

    await user.click(within(filtersPanel).getByRole('button', { name: 'Clear Filters' }))
    expect(screen.getByText('2 products on screen')).toBeInTheDocument()
  })

  it('shows advanced filters and advanced table columns only when advanced search is open', async () => {
    const user = userEvent.setup()

    render(<App />)

    expect(screen.getAllByRole('columnheader').map((header) => header.textContent?.trim())).toEqual([
      'Image',
      'SKU',
      'Tên',
      'Edit',
    ])

    await openAdvancedSearch(user)

    expect(screen.getByPlaceholderText('Search by product name')).toBeInTheDocument()
    expect(screen.getByLabelText('Type')).toBeInTheDocument()
    expect(screen.getByLabelText('HS Name')).toBeInTheDocument()
    expect(screen.getByLabelText('Category')).toBeInTheDocument()
    expect(screen.getAllByRole('columnheader').map((header) => header.textContent?.trim())).toEqual([
      'Image',
      'SKU',
      'Tên',
      'Type',
      'HS Name',
      'HS Code',
      'Category',
      'Edit',
    ])

    fireEvent.change(screen.getByPlaceholderText('Search by SKU'), {
      target: { value: 'NOT-A-REAL-SKU' },
    })

    expect(screen.getByText('No products match the current filters.')).toHaveAttribute(
      'colspan',
      '8',
    )
  })

  it('previews pasted and uploaded HTML, showing new SKUs, duplicate SKUs, and invalid sources before applying', async () => {
    const user = userEvent.setup()
    const newProduct: Product = {
      sku: 'NEW-01',
      name: 'New imported product',
      type: 'Wood',
      hsName: 'Decor',
      hsCode: '1234',
      category: 'Table Decor',
      imageUrls: ['https://minhbros.com/upload/product/mock/new-01.jpg'],
      sourceLabel: 'Pasted HTML',
    }
    const duplicateIncoming: Product = {
      ...seedProducts[0],
      name: 'Updated imported D48',
      imageUrls: ['https://minhbros.com/upload/product/mock/d48-updated.jpg'],
      sourceLabel: 'Upload.html',
    }
    const previewResponse: ImportPreviewResponse = {
      newProducts: [newProduct],
      duplicateCandidates: [
        {
          sku: seedProducts[0].sku,
          existing: seedProducts[0],
          incoming: duplicateIncoming,
        },
      ],
      invalidSources: ['Bad.html'],
    }
    const catalogApi = createCatalogApiMock({
      previewImport: async () => previewResponse,
    })

    render(<App catalogApi={catalogApi} />)

    await openLocalSource(user)
    await user.type(screen.getByLabelText('Paste HTML'), '<table>preview</table>')
    await user.upload(
      screen.getByLabelText('Upload HTML Files'),
      new File(['<html>bad</html>'], 'Bad.html', { type: 'text/html' }),
    )
    await user.click(screen.getByRole('button', { name: 'Preview Import' }))

    await waitFor(() => expect(catalogApi.previewImport).toHaveBeenCalledTimes(1))
    expect(catalogApi.previewImport).toHaveBeenCalledWith({
      pastedHtml: '<table>preview</table>',
      uploadedSources: [
        {
          name: 'Bad.html',
          html: '<html>bad</html>',
        },
      ],
    })

    expect(await screen.findByText('NEW-01')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /overwrite d48/i })).not.toBeChecked()
    expect(screen.getByText('Bad.html')).toBeInTheDocument()
  })

  it('skips duplicate SKUs until explicitly selected and updates the in-memory catalog from the apply response', async () => {
    const user = userEvent.setup()
    const newProduct: Product = {
      sku: 'NEW-02',
      name: 'Fresh product',
      type: 'Wood',
      hsName: 'Decor',
      hsCode: '5678',
      category: 'Table Decor',
      imageUrls: ['https://minhbros.com/upload/product/mock/new-02.jpg'],
      sourceLabel: 'Pasted HTML',
    }
    const duplicateIncoming: Product = {
      ...seedProducts[0],
      name: 'Overwritten D48',
      sourceLabel: 'Upload.html',
    }
    const previewResponse: ImportPreviewResponse = {
      newProducts: [newProduct],
      duplicateCandidates: [
        {
          sku: seedProducts[0].sku,
          existing: seedProducts[0],
          incoming: duplicateIncoming,
        },
      ],
      invalidSources: [],
    }
    const appliedProducts: Product[] = [seedProducts[0], seedProducts[1], newProduct]
    const catalogApi = createCatalogApiMock({
      previewImport: async () => previewResponse,
      applyImport: async () => ({
        products: appliedProducts,
      }),
    })

    render(<App catalogApi={catalogApi} />)

    await openLocalSource(user)
    await user.type(screen.getByLabelText('Paste HTML'), '<table>preview</table>')
    await user.click(screen.getByRole('button', { name: 'Preview Import' }))
    await screen.findByText('NEW-02')

    expect(screen.getByRole('checkbox', { name: /overwrite d48/i })).not.toBeChecked()

    await user.click(screen.getByRole('button', { name: 'Apply to Source' }))

    await waitFor(() => expect(catalogApi.applyImport).toHaveBeenCalledTimes(1))
    expect(catalogApi.applyImport).toHaveBeenCalledWith({
      newProducts: [newProduct],
      duplicateUpdates: [],
    })

    expect(await screen.findByText('Fresh product')).toBeInTheDocument()
    expect(screen.getByText('Tranh manh ghep 2 tang D48')).toBeInTheDocument()
    expect(screen.queryByText('Overwritten D48')).not.toBeInTheDocument()
  })

  it('preserves Local Source draft inputs and duplicate selections when the panel is collapsed and reopened', async () => {
    const user = userEvent.setup()
    const previewResponse: ImportPreviewResponse = {
      newProducts: [],
      duplicateCandidates: [
        {
          sku: seedProducts[0].sku,
          existing: seedProducts[0],
          incoming: {
            ...seedProducts[0],
            name: 'Updated imported D48',
            sourceLabel: 'Upload.html',
          },
        },
      ],
      invalidSources: [],
    }
    const catalogApi = createCatalogApiMock({
      previewImport: async () => previewResponse,
    })

    render(<App catalogApi={catalogApi} />)

    await openLocalSource(user)
    await user.type(screen.getByLabelText('Paste HTML'), '<table>persist</table>')
    await user.upload(
      screen.getByLabelText('Upload HTML Files'),
      new File(['<html>persist</html>'], 'Persist.html', { type: 'text/html' }),
    )
    await user.click(screen.getByRole('button', { name: 'Preview Import' }))
    await screen.findByRole('checkbox', { name: /overwrite d48/i })
    await user.click(screen.getByRole('checkbox', { name: /overwrite d48/i }))

    await user.click(screen.getByRole('button', { name: /hide local source/i }))

    expect(screen.queryByLabelText('Paste HTML')).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /overwrite d48/i })).not.toBeInTheDocument()

    await openLocalSource(user)

    expect(screen.getByLabelText('Paste HTML')).toHaveValue('<table>persist</table>')
    expect(screen.getByText('1 file selected')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /overwrite d48/i })).toBeChecked()
  })

  it('opens the row editor, shows image thumbnails beside each URL, and saves the edited product back into the table', async () => {
    const user = userEvent.setup()
    const updatedProduct: Product = {
      ...seedProducts[0],
      sku: 'D48-UPDATED',
      name: 'Edited D48 Product',
      imageUrls: [
        'https://minhbros.com/upload/product/mock/d48-edited-1.jpg',
        'https://minhbros.com/upload/product/mock/d48-edited-2.jpg',
      ],
    }
    const catalogApi = createCatalogApiMock({
      updateProduct: async () => ({
        products: [updatedProduct, seedProducts[1]],
        product: updatedProduct,
      }),
    })

    render(<App catalogApi={catalogApi} />)

    await openLocalSource(user)
    await user.click(screen.getByRole('button', { name: 'Edit product D48' }))

    expect(await screen.findByRole('dialog', { name: /edit tranh manh ghep 2 tang d48/i })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Preview for image URL 1' })).toHaveAttribute(
      'src',
      seedProducts[0].imageUrls[0],
    )
    expect(screen.getByRole('img', { name: 'Preview for image URL 2' })).toHaveAttribute(
      'src',
      seedProducts[0].imageUrls[1],
    )

    await user.clear(screen.getByRole('textbox', { name: 'SKU' }))
    await user.type(screen.getByRole('textbox', { name: 'SKU' }), updatedProduct.sku)
    await user.clear(screen.getByRole('textbox', { name: 'Tên' }))
    await user.type(screen.getByRole('textbox', { name: 'Tên' }), updatedProduct.name)
    await user.clear(screen.getByRole('textbox', { name: 'Image URL 1' }))
    await user.type(screen.getByRole('textbox', { name: 'Image URL 1' }), updatedProduct.imageUrls[0])
    await user.click(screen.getByRole('button', { name: 'Save Product' }))

    await waitFor(() => expect(catalogApi.updateProduct).toHaveBeenCalledTimes(1))
    expect(catalogApi.updateProduct).toHaveBeenCalledWith({
      originalSku: 'D48',
      product: expect.objectContaining({
        sku: 'D48-UPDATED',
        name: 'Edited D48 Product',
        imageUrls: expect.arrayContaining(['https://minhbros.com/upload/product/mock/d48-edited-1.jpg']),
      }),
    })

    expect(await screen.findByText('Edited D48 Product')).toBeInTheDocument()
    expect(screen.getByText('D48-UPDATED')).toBeInTheDocument()
  })

  it('keeps the compact gallery behavior for multi-image rows', async () => {
    const user = userEvent.setup()

    render(<App />)

    await user.click(screen.getByRole('button', { name: 'View image 2 of 2 for Tranh manh ghep 2 tang D48' }))

    const dialog = screen.getByRole('dialog', { name: 'Tranh manh ghep 2 tang D48 images' })
    expect(within(dialog).getByRole('img', { name: 'Tranh manh ghep 2 tang D48 image 2' })).toHaveAttribute(
      'src',
      seedProducts[0].imageUrls[1],
    )
  })

  it('hides dev-only source management and row editing in production/view-only mode', async () => {
    const user = userEvent.setup()

    render(<App isEditableCatalog={false} />)
    await expandCatalogInfo(user)

    expect(screen.queryByRole('region', { name: 'Catalog source editor' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit product D48' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('columnheader').map((header) => header.textContent?.trim())).toEqual([
      'Image',
      'SKU',
      'Tên',
    ])
  })
})
