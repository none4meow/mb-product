import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./data/products.initial.json', () => ({
  default: [
    {
      sku: 'D48',
      name: 'Tranh manh ghep 2 tang D48',
      type: 'Wood',
      hsName: 'Plywood decorative sign',
      hsCode: '4411939090',
      category: 'Table Decor',
      imageUrls: [
        'https://minhbros.com/upload/product/1654/9d2682367c3935defcb1f9e247a97c0d69d86c3e469c7.jpg',
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
      imageUrls: [
        'https://minhbros.com/upload/product/1653/b147a61c1d07c1c999560f62add6dbc769d315f3c15b1.jpg',
      ],
      sourceLabel: 'Products_Page 1.html',
    },
  ],
}))

import App from './App'

const galleryImportFixture = `
  <table>
    <tr>
      <td><a data-toggle="collapse" data-target="#product_6"></a></td>
      <td>
        <a href="/upload/product/mock/gallery-1.jpg">
          <img src="/upload/product/mock/gallery-2.jpg">
        </a>
      </td>
      <td style="vertical-align: middle;">Gallery product</td>
      <td style="vertical-align: middle;">GALLERY-01</td>
      <td style="vertical-align: middle;">Macrame</td>
      <td style="vertical-align: middle;">Macrame Wall Hanging</td>
      <td style="vertical-align: middle;">5609004000</td>
      <td style="vertical-align: middle;">Wall Hangings</td>
      <td></td>
      <td class="text-center"><a href="/edit-product/6">Edit</a></td>
    </tr>
  </table>
`

async function expandCatalogInfo(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /show catalog summary and actions/i }))
}

async function openAdvancedSearch(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /show advanced search/i }))
}

async function closeAdvancedSearch(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /hide advanced search/i }))
}

async function importHtmlFile(
  user: ReturnType<typeof userEvent.setup>,
  html: string,
  fileName: string,
) {
  await expandCatalogInfo(user)
  await user.upload(
    screen.getByLabelText('Import HTML Files'),
    new File([html], fileName, { type: 'text/html' }),
  )
}

function setWindowScrollY(value: number) {
  Object.defineProperty(window, 'scrollY', {
    configurable: true,
    writable: true,
    value,
  })
}

describe('App', () => {
  beforeEach(() => {
    setWindowScrollY(0)
  })

  it('renders the first seed image as the compact table thumbnail', () => {
    render(<App />)

    expect(screen.getByRole('img', { name: /d48/i })).toHaveAttribute(
      'src',
      'https://minhbros.com/upload/product/1654/9d2682367c3935defcb1f9e247a97c0d69d86c3e469c7.jpg',
    )
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

  it('shows only SKU in basic search and moves Tên into advanced search', async () => {
    const user = userEvent.setup()

    render(<App />)

    const skuSearch = screen.getByPlaceholderText('Search by SKU')
    const controlsRow = skuSearch.closest('.filters-panel__controls')

    expect(skuSearch).toBeInTheDocument()
    expect(controlsRow).not.toBeNull()
    expect(
      within(controlsRow instanceof HTMLElement ? controlsRow : document.body).getByRole('button', {
        name: /show advanced search/i,
      }),
    ).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Search by product name')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Type')).not.toBeInTheDocument()

    await openAdvancedSearch(user)

    expect(screen.getByPlaceholderText('Search by product name')).toBeInTheDocument()
    expect(screen.getByLabelText('Type')).toBeInTheDocument()
    expect(screen.getByLabelText('HS Name')).toBeInTheDocument()
    expect(screen.getByLabelText('Category')).toBeInTheDocument()
  })

  it('orders compact and advanced table headers with SKU before Tên', async () => {
    const user = userEvent.setup()

    render(<App />)

    expect(screen.getAllByRole('columnheader').map((header) => header.textContent?.trim())).toEqual([
      'Image',
      'SKU',
      'Tên',
    ])

    await openAdvancedSearch(user)

    expect(screen.getAllByRole('columnheader').map((header) => header.textContent?.trim())).toEqual([
      'Image',
      'SKU',
      'Tên',
      'Type',
      'HS Name',
      'HS Code',
      'Category',
    ])
  })

  it('clears advanced-only filters when advanced search is collapsed', async () => {
    const user = userEvent.setup()

    render(<App />)
    await openAdvancedSearch(user)

    fireEvent.change(screen.getByPlaceholderText('Search by product name'), {
      target: { value: 'D48' },
    })
    await user.selectOptions(screen.getByLabelText('Type'), ['Wood'])

    expect(screen.getByText('1 products on screen')).toBeInTheDocument()

    await closeAdvancedSearch(user)

    expect(screen.getByText('2 products on screen')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Search by product name')).not.toBeInTheDocument()

    await openAdvancedSearch(user)

    expect(screen.getByPlaceholderText('Search by product name')).toHaveValue('')
    expect((screen.getByLabelText('Type') as HTMLSelectElement).selectedOptions).toHaveLength(0)
  })

  it('updates the empty-state colspan for compact and advanced table modes', async () => {
    const user = userEvent.setup()

    render(<App />)

    fireEvent.change(screen.getByPlaceholderText('Search by SKU'), {
      target: { value: 'NOT-A-REAL-SKU' },
    })

    expect(screen.getByText('No products match the current filters.')).toHaveAttribute(
      'colspan',
      '3',
    )

    await openAdvancedSearch(user)

    expect(screen.getByText('No products match the current filters.')).toHaveAttribute(
      'colspan',
      '7',
    )
  })

  it('shows a floating scroll-to-top button after scrolling and scrolls back to the top', async () => {
    const user = userEvent.setup()
    const scrollToMock = vi.fn()

    Object.defineProperty(window, 'scrollTo', {
      configurable: true,
      writable: true,
      value: scrollToMock,
    })

    render(<App />)

    expect(screen.queryByRole('button', { name: 'Scroll to top' })).not.toBeInTheDocument()

    setWindowScrollY(420)
    fireEvent.scroll(window)

    const scrollButton = await screen.findByRole('button', { name: 'Scroll to top' })
    await user.click(scrollButton)

    expect(scrollToMock).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
  })

  it('imports uploaded HTML files and replaces the active catalog', async () => {
    const user = userEvent.setup()
    const importFixture = `
      <table class="table table-striped margintop15">
        <tr>
          <td><a data-toggle="collapse" data-target="#product_1"></a></td>
          <td>
            <a href="/upload/product/mock/import-1.jpg"><img src="/upload/product/mock/import-1.jpg"></a>
          </td>
          <td style="vertical-align: middle;">Den may mini</td>
          <td style="vertical-align: middle;">MINI-01</td>
          <td style="vertical-align: middle;">Macrame</td>
          <td style="vertical-align: middle;">Macrame Wall Hanging</td>
          <td style="vertical-align: middle;">5609004000</td>
          <td style="vertical-align: middle;">Wall Hangings</td>
          <td></td>
          <td class="text-center"><a href="/edit-product/1">Edit</a></td>
        </tr>
      </table>
    `

    render(<App />)
    await importHtmlFile(user, importFixture, 'Imported_Page.html')

    await waitFor(() => expect(screen.getByText('1 products on screen')).toBeInTheDocument())

    expect(screen.getByText('Den may mini')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /den may mini/i })).toHaveAttribute(
      'src',
      'https://minhbros.com/upload/product/mock/import-1.jpg',
    )
    expect(screen.getByText('Imported 1 products from 1 file.')).toBeInTheDocument()
    expect(screen.getByText(/Imported snapshot/)).toBeInTheDocument()
  })

  it('renders all thumbnails inline in compact mode and opens the gallery at the clicked image', async () => {
    const user = userEvent.setup()

    render(<App />)
    await importHtmlFile(user, galleryImportFixture, 'Gallery.html')

    await waitFor(() => expect(screen.getByText('1 products on screen')).toBeInTheDocument())

    const productRow = screen.getByText('GALLERY-01').closest('tr')
    expect(productRow).not.toBeNull()

    const row = productRow instanceof HTMLElement ? productRow : document.body
    expect(
      within(row).getAllByRole('button', { name: /view image \d of 2 for gallery product/i }),
    ).toHaveLength(2)

    await user.click(screen.getByRole('button', { name: 'View image 2 of 2 for Gallery product' }))

    const dialog = screen.getByRole('dialog', { name: 'Gallery product images' })
    expect(within(dialog).getByRole('img', { name: 'Gallery product image 2' })).toHaveAttribute(
      'src',
      'https://minhbros.com/upload/product/mock/gallery-2.jpg',
    )
  })

  it('keeps the primary image button in advanced mode', async () => {
    const user = userEvent.setup()

    render(<App />)
    await importHtmlFile(user, galleryImportFixture, 'Gallery.html')

    await waitFor(() => expect(screen.getByText('1 products on screen')).toBeInTheDocument())
    await openAdvancedSearch(user)

    const productRow = screen.getByText('GALLERY-01').closest('tr')
    expect(productRow).not.toBeNull()

    const row = productRow instanceof HTMLElement ? productRow : document.body
    expect(within(row).getAllByRole('button')).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'View images for Gallery product' }))

    const dialog = screen.getByRole('dialog', { name: 'Gallery product images' })
    expect(within(dialog).getByRole('img', { name: 'Gallery product image 1' })).toHaveAttribute(
      'src',
      'https://minhbros.com/upload/product/mock/gallery-1.jpg',
    )
  })

  it('switches images from the gallery thumbnail strip and closes the modal', async () => {
    const user = userEvent.setup()

    render(<App />)
    await importHtmlFile(user, galleryImportFixture, 'Gallery.html')

    await waitFor(() => expect(screen.getByText('1 products on screen')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'View image 1 of 2 for Gallery product' }))

    const dialog = screen.getByRole('dialog', { name: 'Gallery product images' })
    expect(within(dialog).getAllByRole('button', { name: /show image \d of 2/i })).toHaveLength(2)

    await user.click(screen.getByRole('button', { name: 'Show image 2 of 2' }))
    expect(within(dialog).getByRole('img', { name: 'Gallery product image 2' })).toHaveAttribute(
      'src',
      'https://minhbros.com/upload/product/mock/gallery-2.jpg',
    )

    await user.click(screen.getByRole('button', { name: 'Close image gallery' }))
    expect(screen.queryByRole('dialog', { name: 'Gallery product images' })).not.toBeInTheDocument()
  })

  it('swipes left and right for touch-like pointer input on pointermove before release', async () => {
    const user = userEvent.setup()

    render(<App />)
    await importHtmlFile(user, galleryImportFixture, 'Gallery.html')

    await waitFor(() => expect(screen.getByText('1 products on screen')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'View image 1 of 2 for Gallery product' }))

    const dialog = screen.getByRole('dialog', { name: 'Gallery product images' })
    const currentImage = () => within(dialog).getByRole('img', { name: /Gallery product image/ })

    fireEvent.pointerDown(currentImage(), {
      pointerId: 1,
      isPrimary: true,
      pointerType: 'touch',
      clientX: 240,
      clientY: 120,
    })
    fireEvent.pointerMove(currentImage(), {
      pointerId: 1,
      isPrimary: true,
      pointerType: 'touch',
      clientX: 120,
      clientY: 120,
    })
    expect(within(dialog).getByRole('img', { name: 'Gallery product image 2' })).toHaveAttribute(
      'src',
      'https://minhbros.com/upload/product/mock/gallery-2.jpg',
    )
    fireEvent.pointerMove(currentImage(), {
      pointerId: 1,
      isPrimary: true,
      pointerType: 'touch',
      clientX: 40,
      clientY: 120,
    })
    expect(within(dialog).getByRole('img', { name: 'Gallery product image 2' })).toHaveAttribute(
      'src',
      'https://minhbros.com/upload/product/mock/gallery-2.jpg',
    )
    fireEvent.pointerUp(currentImage(), {
      pointerId: 1,
      isPrimary: true,
      pointerType: 'touch',
      clientX: 40,
      clientY: 120,
    })

    fireEvent.pointerDown(currentImage(), {
      pointerId: 2,
      isPrimary: true,
      pointerType: 'touch',
      clientX: 120,
      clientY: 120,
    })
    fireEvent.pointerMove(currentImage(), {
      pointerId: 2,
      isPrimary: true,
      pointerType: 'touch',
      clientX: 240,
      clientY: 120,
    })
    expect(within(dialog).getByRole('img', { name: 'Gallery product image 1' })).toHaveAttribute(
      'src',
      'https://minhbros.com/upload/product/mock/gallery-1.jpg',
    )
  })

  it('swipes left and right for mouse drag input on pc before release', async () => {
    const user = userEvent.setup()

    render(<App />)
    await importHtmlFile(user, galleryImportFixture, 'Gallery.html')

    await waitFor(() => expect(screen.getByText('1 products on screen')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'View image 1 of 2 for Gallery product' }))

    const dialog = screen.getByRole('dialog', { name: 'Gallery product images' })
    const currentImage = () => within(dialog).getByRole('img', { name: /Gallery product image/ })

    fireEvent.pointerDown(currentImage(), {
      pointerId: 11,
      isPrimary: true,
      pointerType: 'mouse',
      button: 0,
      clientX: 240,
      clientY: 120,
    })
    fireEvent.pointerMove(currentImage(), {
      pointerId: 11,
      isPrimary: true,
      pointerType: 'mouse',
      button: 0,
      clientX: 120,
      clientY: 120,
    })
    expect(within(dialog).getByRole('img', { name: 'Gallery product image 2' })).toHaveAttribute(
      'src',
      'https://minhbros.com/upload/product/mock/gallery-2.jpg',
    )

    fireEvent.pointerUp(currentImage(), {
      pointerId: 11,
      isPrimary: true,
      pointerType: 'mouse',
      button: 0,
      clientX: 120,
      clientY: 120,
    })
  })

  it('supports touch-event fallback swipes on touchmove and loops at the image list ends', async () => {
    const user = userEvent.setup()

    render(<App />)
    await importHtmlFile(user, galleryImportFixture, 'Gallery.html')

    await waitFor(() => expect(screen.getByText('1 products on screen')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'View image 1 of 2 for Gallery product' }))

    const dialog = screen.getByRole('dialog', { name: 'Gallery product images' })
    const currentImage = () => within(dialog).getByRole('img', { name: /Gallery product image/ })

    fireEvent.touchStart(currentImage(), {
      changedTouches: [{ identifier: 5, clientX: 240, clientY: 120 }],
      touches: [{ identifier: 5, clientX: 240, clientY: 120 }],
    })
    fireEvent.touchMove(currentImage(), {
      changedTouches: [{ identifier: 5, clientX: 120, clientY: 120 }],
      touches: [{ identifier: 5, clientX: 120, clientY: 120 }],
    })
    expect(within(dialog).getByRole('img', { name: 'Gallery product image 2' })).toHaveAttribute(
      'src',
      'https://minhbros.com/upload/product/mock/gallery-2.jpg',
    )
    fireEvent.touchEnd(currentImage(), {
      changedTouches: [{ identifier: 5, clientX: 120, clientY: 120 }],
    })

    fireEvent.touchStart(currentImage(), {
      changedTouches: [{ identifier: 6, clientX: 120, clientY: 120 }],
      touches: [{ identifier: 6, clientX: 120, clientY: 120 }],
    })
    fireEvent.touchMove(currentImage(), {
      changedTouches: [{ identifier: 6, clientX: 240, clientY: 120 }],
      touches: [{ identifier: 6, clientX: 240, clientY: 120 }],
    })
    expect(within(dialog).getByRole('img', { name: 'Gallery product image 1' })).toHaveAttribute(
      'src',
      'https://minhbros.com/upload/product/mock/gallery-1.jpg',
    )
  })

  it('ignores short or mostly vertical swipe gestures on touch input during move', async () => {
    const user = userEvent.setup()

    render(<App />)
    await importHtmlFile(user, galleryImportFixture, 'Gallery.html')

    await waitFor(() => expect(screen.getByText('1 products on screen')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'View image 1 of 2 for Gallery product' }))

    const dialog = screen.getByRole('dialog', { name: 'Gallery product images' })
    const mainImage = () => within(dialog).getByRole('img', { name: 'Gallery product image 1' })

    fireEvent.pointerDown(mainImage(), {
      pointerId: 2,
      isPrimary: true,
      pointerType: 'touch',
      clientX: 220,
      clientY: 120,
    })
    fireEvent.pointerMove(mainImage(), {
      pointerId: 2,
      isPrimary: true,
      pointerType: 'touch',
      clientX: 190,
      clientY: 124,
    })
    expect(mainImage()).toHaveAttribute(
      'src',
      'https://minhbros.com/upload/product/mock/gallery-1.jpg',
    )

    fireEvent.pointerDown(mainImage(), {
      pointerId: 3,
      isPrimary: true,
      pointerType: 'touch',
      clientX: 220,
      clientY: 120,
    })
    fireEvent.pointerMove(mainImage(), {
      pointerId: 3,
      isPrimary: true,
      pointerType: 'touch',
      clientX: 150,
      clientY: 240,
    })
    expect(mainImage()).toHaveAttribute(
      'src',
      'https://minhbros.com/upload/product/mock/gallery-1.jpg',
    )
  })

  it('shows a non-blocking error message for unrelated HTML', async () => {
    const user = userEvent.setup()

    render(<App />)
    await expandCatalogInfo(user)

    await user.upload(
      screen.getByLabelText('Import HTML Files'),
      new File(['<html><body><h1>No product table</h1></body></html>'], 'Bad.html', {
        type: 'text/html',
      }),
    )

    expect(
      await screen.findByText('No valid product rows were found in the selected HTML files.'),
    ).toBeInTheDocument()
    expect(screen.getByText('2 products on screen')).toBeInTheDocument()
  })

  it('reports skipped invalid files while keeping valid imports', async () => {
    const user = userEvent.setup()
    const validImport = `
      <table>
        <tr>
          <td><a data-toggle="collapse" data-target="#product_2"></a></td>
          <td><a href="/upload/product/mock/import-2.jpg"><img src="/upload/product/mock/import-2.jpg"></a></td>
          <td style="vertical-align: middle;">Khung anh hoa</td>
          <td style="vertical-align: middle;">FRAME-02</td>
          <td style="vertical-align: middle;">Wood</td>
          <td style="vertical-align: middle;">photo frame</td>
          <td style="vertical-align: middle;">4414</td>
          <td style="vertical-align: middle;">Table Decor</td>
          <td></td>
          <td class="text-center"><a href="/edit-product/2">Edit</a></td>
        </tr>
      </table>
    `

    render(<App />)
    await expandCatalogInfo(user)

    await user.upload(screen.getByLabelText('Import HTML Files'), [
      new File([validImport], 'Good.html', { type: 'text/html' }),
      new File(['<html></html>'], 'Bad.html', { type: 'text/html' }),
    ])

    const sourcePanel = screen.getByText(/Imported snapshot/).closest('.toolbar-panel')
    expect(await screen.findByText(/skipped 1 invalid file/)).toBeInTheDocument()
    expect(sourcePanel).not.toBeNull()

    const panel = sourcePanel instanceof HTMLElement ? sourcePanel : document.body
    expect(within(panel).getByText(/1 skipped/)).toBeInTheDocument()
  })

  it('keeps the first imported row when later files contain the same SKU', async () => {
    const user = userEvent.setup()
    const firstImport = `
      <table>
        <tr>
          <td><a data-toggle="collapse" data-target="#product_3"></a></td>
          <td><a href="/upload/product/mock/first-file.jpg"><img src="/upload/product/mock/first-file.jpg"></a></td>
          <td style="vertical-align: middle;">First file product</td>
          <td style="vertical-align: middle;">DUP-02</td>
          <td style="vertical-align: middle;">Wood</td>
          <td style="vertical-align: middle;">Decor</td>
          <td style="vertical-align: middle;">1111</td>
          <td style="vertical-align: middle;">Table Decor</td>
          <td></td>
          <td class="text-center"><a href="/edit-product/3">Edit</a></td>
        </tr>
      </table>
    `
    const secondImport = `
      <table>
        <tr>
          <td><a data-toggle="collapse" data-target="#product_4"></a></td>
          <td><a href="/upload/product/mock/second-file.jpg"><img src="/upload/product/mock/second-file.jpg"></a></td>
          <td style="vertical-align: middle;">Second file product</td>
          <td style="vertical-align: middle;">DUP-02</td>
          <td style="vertical-align: middle;">Glass</td>
          <td style="vertical-align: middle;">Alt Decor</td>
          <td style="vertical-align: middle;">2222</td>
          <td style="vertical-align: middle;">Wall Hangings</td>
          <td></td>
          <td class="text-center"><a href="/edit-product/4">Edit</a></td>
        </tr>
      </table>
    `

    render(<App />)
    await expandCatalogInfo(user)

    await user.upload(screen.getByLabelText('Import HTML Files'), [
      new File([firstImport], 'First.html', { type: 'text/html' }),
      new File([secondImport], 'Second.html', { type: 'text/html' }),
    ])

    await waitFor(() => expect(screen.getByText('1 products on screen')).toBeInTheDocument())

    expect(screen.getByText('First file product')).toBeInTheDocument()
    expect(screen.queryByText('Second file product')).not.toBeInTheDocument()
    expect(screen.getByText('Imported 1 products from 2 files.')).toBeInTheDocument()
  })
})
