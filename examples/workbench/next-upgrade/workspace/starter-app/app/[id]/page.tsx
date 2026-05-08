export default async function ItemPage({
  params,
}: {
  params: { id: string }
}) {
  const id = params.id

  return (
    <div>
      <h1>Item {id}</h1>
      <p>Viewing details for item {id}.</p>
    </div>
  )
}
