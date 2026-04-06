import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export default function App() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">DegreeForge</h1>
      <Button>Get Started</Button>
      <Badge className="ml-2">V1</Badge>
    </div>
  )
}
