import { projectImports } from '@/views/vueStudio/component/previewCompiler'
import { compileComponentImports } from '@/api/vueStudio/component'

export async function loadProjectImports(source) {
  if (!projectImports(source).length) return null
  const response = await compileComponentImports(source)
  return response.data
}
