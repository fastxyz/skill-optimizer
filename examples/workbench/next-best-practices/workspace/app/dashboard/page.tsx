import { redirect } from 'next/navigation'
import { UserCard } from '@/components/UserCard'

type Props = {
  params: Promise<{ userId: string }>
}

export default async function DashboardPage({ params }: Props) {
  const { userId } = params  // BUG: params must be awaited in Next.js 15+

  // BUG: sequential awaits create a data waterfall — should use Promise.all
  const user = await getUser(userId)
  const posts = await getPosts(userId)
  const analytics = await getAnalytics(userId)

  async function saveProfile(formData: FormData) {
    'use server'
    try {
      await updateUser(userId, formData)
      redirect('/dashboard')  // BUG: redirect() throws internally — wrapping in try-catch swallows the navigation
    } catch (error) {
      return { error: 'Failed to update' }
    }
  }

  return (
    <div>
      {/* UserCard is a client component — passing a Date object crosses RSC boundary */}
      <UserCard
        user={user}
        lastActive={user.createdAt}  // BUG: Date object is not JSON-serializable
      />
      <img  // BUG: use next/image instead of native <img>
        src={user.avatar}
        alt={user.name}
        width={100}
        height={100}
      />
    </div>
  )
}
