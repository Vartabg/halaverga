import type { Metadata } from 'next';
import Crossing from '@/crossing/Crossing';

export const metadata: Metadata = {
  title: 'The Cloven Arch · Halaverga',
  description: 'Fly above Mount Hermon and turn a Watcher away from two travelers at the crossing. A fictional flight study.',
};

export default function CrossingPage() {
  return <Crossing />;
}
