'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { Popover } from 'radix-ui';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/client/api';
import { relTime } from '@/lib/client/format';

export interface NotificationItem {
  id: string;
  kind: string;
  title: string;
  body: string;
  url: string | null;
  readAt: string | null;
  createdAt: string;
}
type Payload = { notifications: NotificationItem[]; unread: number };

export const BROWSER_NOTIFS_KEY = 'relay:browser-notifications';

/** Notification bell (SPEC §14): unread count, list, mark-all-read, optional browser notifications while a tab is open. */
export function NotificationBell({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['notifications', workspaceId],
    queryFn: () => api<Payload>(`/api/w/${workspaceId}/notifications`),
    refetchInterval: 10_000,
  });
  const seen = useRef<Set<string> | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!data) return;
    const ids = new Set(data.notifications.map((n) => n.id));
    // First load only records what exists; later arrivals can raise a browser notification.
    if (seen.current && typeof Notification !== 'undefined' && Notification.permission === 'granted' && localStorage.getItem(BROWSER_NOTIFS_KEY) === '1') {
      for (const n of data.notifications) {
        if (!seen.current.has(n.id) && !n.readAt) {
          try {
            const b = new Notification(n.title, { body: n.body, tag: n.id });
            b.onclick = () => {
              window.focus();
              if (n.url) window.location.href = n.url;
            };
          } catch {
            /* some browsers disallow constructing Notification */
          }
        }
      }
    }
    seen.current = ids;
  }, [data]);

  const unread = data?.unread ?? 0;
  async function markAll() {
    await api(`/api/w/${workspaceId}/notifications/read`, { body: { all: true } });
    await qc.invalidateQueries({ queryKey: ['notifications', workspaceId] });
  }
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <Button variant="ghost" size="icon" aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} className="relative">
          <Bell />
          {unread > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-4 text-white" aria-hidden="true">
              {unread > 9 ? '9+' : unread}
            </span>
          ) : null}
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={8} className="z-50 w-[360px] max-w-[92vw] rounded-xl border border-line bg-surface shadow-xl">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <h2 className="text-sm font-semibold">Notifications</h2>
            <Button size="sm" variant="ghost" disabled={!unread} onClick={markAll}>
              Mark all read
            </Button>
          </div>
          <ul className="max-h-96 divide-y divide-line overflow-y-auto">
            {!data?.notifications.length ? <li className="px-4 py-6 text-center text-sm text-muted">Nothing yet. Results, digests and window reminders show up here.</li> : null}
            {data?.notifications.map((n) => (
              <li key={n.id} className={n.readAt ? '' : 'bg-primary-soft/40'}>
                <a
                  href={n.url ?? '#'}
                  target={n.url?.startsWith('http') && !n.url.includes(window.location.host) ? '_blank' : undefined}
                  rel="noreferrer"
                  className="block px-4 py-2.5 hover:bg-surface-2"
                  onClick={async () => {
                    await api(`/api/w/${workspaceId}/notifications/read`, { body: { ids: [n.id] } }).catch(() => {});
                    qc.invalidateQueries({ queryKey: ['notifications', workspaceId] });
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-sm font-medium">
                      {!n.readAt ? <span className="mr-1.5 inline-block size-1.5 rounded-full bg-primary align-middle" aria-label="Unread" /> : null}
                      {n.title}
                    </span>
                    <time className="shrink-0 text-xs text-muted" dateTime={n.createdAt}>
                      {relTime(n.createdAt)}
                    </time>
                  </div>
                  {n.body ? <p className="mt-0.5 text-xs text-muted">{n.body}</p> : null}
                </a>
              </li>
            ))}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
