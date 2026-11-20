import { redirect } from 'next/navigation';

// The old Run page now lives on the homepage ("Find & Run").
export default function RunRedirect() {
  redirect('/');
}
