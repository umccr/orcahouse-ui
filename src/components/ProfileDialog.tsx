'use client';

import type { ReactNode } from 'react';
import { FingerprintPattern, Globe, Mail, ShieldAlert, ShieldCheck, Users } from 'lucide-react';
import { initials, type AuthUser } from '@/lib/auth';
import { Dialog } from './Dialog';

interface Props {
  user: AuthUser;
  open: boolean;
  onClose: () => void;
}

const LABEL = 'text-muted dark:text-muted-dark text-[11px] font-semibold tracking-wider uppercase';
const CARD = 'border-line dark:border-line-dark rounded-lg border';

function Row({ label, children, mono }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className='flex items-baseline justify-between gap-4 px-4 py-2'>
      <span className='text-muted dark:text-muted-dark shrink-0 text-[11px]'>{label}</span>
      <span className={`min-w-0 truncate text-right text-xs ${mono ? 'font-mono' : ''}`}>
        {children}
      </span>
    </div>
  );
}

/** Who the mart API sees: claims from the Cognito ID token. */
export function ProfileDialog({ user, open, onClose }: Props) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={user.name}
      description={user.email}
      icon={<span className='text-xs font-semibold'>{initials(user.name)}</span>}
    >
      <div className='space-y-5'>
        <div className={`${CARD} divide-line dark:divide-line-dark divide-y`}>
          <div className='flex items-start gap-3 px-4 py-3'>
            <Mail className='text-muted dark:text-muted-dark mt-0.5 h-4 w-4 shrink-0' />
            <div className='min-w-0 flex-1'>
              <p className={LABEL}>Email</p>
              <p className='mt-0.5 text-[13px] break-all'>{user.email || '—'}</p>
            </div>
            <span
              className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                user.emailVerified
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
                  : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400'
              }`}
            >
              {user.emailVerified ? (
                <ShieldCheck className='h-3 w-3' aria-hidden='true' />
              ) : (
                <ShieldAlert className='h-3 w-3' aria-hidden='true' />
              )}
              {user.emailVerified ? 'Verified' : 'Unverified'}
            </span>
          </div>
          <div className='flex items-start gap-3 px-4 py-3'>
            <FingerprintPattern className='text-muted dark:text-muted-dark mt-0.5 h-4 w-4 shrink-0' />
            <div className='min-w-0 flex-1'>
              <p className={LABEL}>User ID</p>
              <p className='mt-0.5 font-mono text-[11px] break-all'>{user.sub || '—'}</p>
            </div>
          </div>
        </div>

        {user.groups.length > 0 && (
          <section>
            <h3 className={`${LABEL} mb-2`}>Groups</h3>
            <div className={`${CARD} flex items-start gap-3 px-4 py-3`}>
              <Users className='text-muted dark:text-muted-dark mt-0.5 h-4 w-4 shrink-0' />
              <div className='flex min-w-0 flex-1 flex-wrap gap-1.5'>
                {user.groups.map((group) => (
                  <span
                    key={group}
                    className='dark:bg-raised-dark rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium'
                  >
                    {group}
                  </span>
                ))}
              </div>
            </div>
          </section>
        )}

        {user.identities.length > 0 && (
          <section>
            <h3 className={`${LABEL} mb-2`}>Connected accounts</h3>
            <div className='space-y-2'>
              {user.identities.map((identity) => (
                <div
                  key={`${identity.providerName}:${identity.userId}`}
                  className={`${CARD} divide-line dark:divide-line-dark divide-y`}
                >
                  <div className='flex items-center gap-3 px-4 py-3'>
                    <span className='dark:bg-raised-dark flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100'>
                      <Globe className='text-muted dark:text-muted-dark h-3.5 w-3.5' />
                    </span>
                    <span className='flex-1 text-[13px] font-medium'>{identity.providerName}</span>
                    {identity.primary && (
                      <span className='bg-signal/10 text-signal rounded-full px-2 py-0.5 text-[11px] font-medium'>
                        Primary
                      </span>
                    )}
                  </div>
                  {identity.providerType && identity.providerType !== identity.providerName && (
                    <Row label='Provider type'>{identity.providerType}</Row>
                  )}
                  {identity.userId && (
                    <Row label='User ID' mono>
                      {identity.userId}
                    </Row>
                  )}
                  {identity.issuer && (
                    <Row label='Issuer' mono>
                      {identity.issuer}
                    </Row>
                  )}
                  {identity.dateCreated && (
                    <Row label='Linked'>
                      {identity.dateCreated.toLocaleString(undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </Row>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </Dialog>
  );
}
