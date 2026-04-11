import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('filters by text and exact-match facets, then clears back to the full list', async () => {
    const user = userEvent.setup()

    render(<App />)

    expect(screen.getByRole('heading', { name: '1,573 products on screen' })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Tên'), {
      target: { value: 'Tranh mảnh ghép 2 tầng D48' },
    })
    fireEvent.change(screen.getByLabelText('SKU'), { target: { value: 'D48' } })
    await user.selectOptions(screen.getByLabelText('Type'), ['Wood'])
    await user.selectOptions(screen.getByLabelText('HS Name'), ['Plywood decorative sign'])
    await user.selectOptions(screen.getByLabelText('Category'), ['Table Decor'])

    expect(screen.getByText('Tranh mảnh ghép 2 tầng D48')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '1 products on screen' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Clear Filters' }))

    expect(screen.getByRole('heading', { name: '1,573 products on screen' })).toBeInTheDocument()
  })

  it('imports uploaded HTML files and replaces the active catalog', async () => {
    const user = userEvent.setup()

    render(<App />)

    const importInput = screen.getByLabelText('Import HTML Files')
    const importFixture = `
      <table class="table table-striped margintop15">
        <tr>
          <td><a data-toggle="collapse" data-target="#product_1"></a></td>
          <td>
            <a href="/upload/product/mock/import-1.jpg"><img src="/upload/product/mock/import-1.jpg"></a>
          </td>
          <td style="vertical-align: middle;">Đèn mây mini</td>
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

    await user.upload(
      importInput,
      new File([importFixture], 'Imported_Page.html', { type: 'text/html' }),
    )

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: '1 products on screen' })).toBeInTheDocument(),
    )

    expect(screen.getByText('Đèn mây mini')).toBeInTheDocument()
    expect(screen.getByText('Imported 1 products from 1 file.')).toBeInTheDocument()
    expect(screen.getByText(/Imported snapshot/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Reset to Seed Data' }))

    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: '1,573 products on screen' }),
      ).toBeInTheDocument(),
    )
  })

  it('shows a non-blocking error message for unrelated HTML', async () => {
    const user = userEvent.setup()

    render(<App />)

    const importInput = screen.getByLabelText('Import HTML Files')

    await user.upload(
      importInput,
      new File(['<html><body><h1>No product table</h1></body></html>'], 'Bad.html', {
        type: 'text/html',
      }),
    )

    expect(
      await screen.findByText('No valid product rows were found in the selected HTML files.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '1,573 products on screen' })).toBeInTheDocument()
  })

  it('reports skipped invalid files while keeping valid imports', async () => {
    const user = userEvent.setup()

    render(<App />)

    const importInput = screen.getByLabelText('Import HTML Files')
    const validImport = `
      <table>
        <tr>
          <td><a data-toggle="collapse" data-target="#product_2"></a></td>
          <td><a href="/upload/product/mock/import-2.jpg"><img src="/upload/product/mock/import-2.jpg"></a></td>
          <td style="vertical-align: middle;">Khung ảnh hoa</td>
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

    await user.upload(importInput, [
      new File([validImport], 'Good.html', { type: 'text/html' }),
      new File(['<html></html>'], 'Bad.html', { type: 'text/html' }),
    ])

    const sourcePanel = screen.getByText(/Imported snapshot/).closest('.toolbar-panel')
    expect(await screen.findByText(/skipped 1 invalid file/)).toBeInTheDocument()
    expect(sourcePanel).not.toBeNull()

    const panel = sourcePanel instanceof HTMLElement ? sourcePanel : document.body
    expect(within(panel).getByText(/1 skipped/)).toBeInTheDocument()
  })
})
