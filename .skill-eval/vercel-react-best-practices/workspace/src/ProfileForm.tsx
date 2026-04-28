import { useEffect, useState } from 'react';

export function ProfileForm({ firstName, lastName }: { firstName: string; lastName: string }) {
  const [fullName, setFullName] = useState('');
  useEffect(() => setFullName(`${firstName} ${lastName}`), [firstName, lastName]);
  return <div>{fullName}</div>;
}
