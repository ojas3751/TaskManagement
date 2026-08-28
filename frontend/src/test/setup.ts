import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// 描いた画面はテストごとに片付ける。残すと、次のテストで同じ文言が2つ見つかって
// getByText が「複数見つかった」で落ちる
afterEach(cleanup)
