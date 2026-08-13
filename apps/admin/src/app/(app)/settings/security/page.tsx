import { requireProfile } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { SecuritySettings } from '@/components/settings/security-settings';

export const dynamic = 'force-dynamic';

export default async function SecurityPage() {
  await requireProfile();
  return (
    <>
      <PageHeader
        title="Security"
        description="Two-factor authentication and active sessions."
      />
      <SecuritySettings />
    </>
  );
}
