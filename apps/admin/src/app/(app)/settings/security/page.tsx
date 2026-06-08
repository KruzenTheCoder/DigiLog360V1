import { requireProfile } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { SecuritySettings } from '@/components/settings/security-settings';

export const dynamic = 'force-dynamic';

export default async function SecurityPage() {
  await requireProfile();
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Security"
        description="Two-factor authentication and active sessions."
      />
      <SecuritySettings />
    </div>
  );
}
