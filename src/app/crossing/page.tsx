import type { Metadata } from 'next';
import Crossing from '@/crossing/Crossing';

export const metadata: Metadata = {
  title: 'The Cloven Arch · Halaverga',
  description: 'An oath on Hermon, a Watcher in pursuit, and two shepherds carrying a live coal. Fly the pass to get their warning to the valley.',
};

export default function CrossingPage() {
  return <Crossing />;
}
