import type { Metadata } from 'next';
import { SiteShell } from '@/components/site/shell';

export const metadata: Metadata = { title: 'Privacy', description: 'What Relay stores, what it never stores, and how to delete it.' };

export default function PrivacyPage() {
  return (
    <SiteShell>
      <main className="prose-relay mx-auto w-full max-w-3xl px-6 pb-16 pt-6">
        <h1 className="font-display text-3xl font-semibold">Privacy</h1>
        <p>Relay is built to need as little of your data as possible. Here is exactly what it stores and how to remove it.</p>
        <h2>What Relay stores</h2>
        <ul>
          <li>Your GitHub profile basics: name, email address, avatar, and login.</li>
          <li>Workspace and member settings: time zone, run windows, reserve, sharing and pause toggles.</li>
          <li>Task metadata and results mirrored from GitHub issues: title, description, labels, files, and the Markdown a run produced, so Relay can show it.</li>
          <li>Your routine’s trigger URL and token, <b>encrypted</b> (AES-256-GCM). They are decrypted only to start your own routine and are never shown again.</li>
          <li>Usage tokens, stored only as a one-way hash, and usage percentages you or your statusLine report.</li>
        </ul>
        <h2>What Relay never stores or does</h2>
        <ul>
          <li>No source code. Relay reads only the result file your routine writes.</li>
          <li>No AI calls of its own. The only Anthropic request is starting <i>your</i> routine, with your token.</li>
          <li>No access beyond the repository you chose when installing the GitHub App.</li>
        </ul>
        <h2>Attribution and control</h2>
        <p>Everything Relay does on GitHub is visible there. Sharing is off until you opt in, and you can pause your seat at any time. Simulated teammates in demo mode are always labeled and never run tasks.</p>
        <h2>Deleting your data</h2>
        <ul>
          <li><b>Delete a workspace</b> (owner): removes all Relay data for it. GitHub history is untouched.</li>
          <li><b>Delete your account</b>: removes your user, memberships, usage tokens and encrypted routine credentials. Owners must transfer or delete their workspaces first.</li>
          <li><b>Uninstall the GitHub App</b> on GitHub: the workspace is marked disconnected immediately.</li>
        </ul>
        <h2>Limits</h2>
        <p>To keep the service healthy: 10 task creations per minute per member, 200 per day per workspace, and 20 workspaces per user.</p>
      </main>
    </SiteShell>
  );
}
