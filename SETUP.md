# Pocket Workspace v2

A GitHub Pages app for editing/running HTML, public HTML sharing, immutable offline copies, and peer-to-peer transfers.

## Upload to GitHub Pages

1. Unzip the download.
2. Upload the files **inside** the folder to your repository's published folder. Replace the old `index.html`.
3. Keep these app files together: `index.html`, `features.css`, `features.js`, `snapshot.js`, `config.js`, `sw.js`, `manifest.webmanifest`, and `icon.svg`. Include `.nojekyll` if uploading through git. The setup documents and SQL may also be uploaded; they contain no secrets.
4. Use GitHub **Settings → Pages → Deploy from a branch → main → / (root)**, or your existing publishing branch/folder.
5. Open your HTTPS Pages URL. In **Offline**, wait for **App ready to open offline**.

There is no build step and no npm installation. Paths work under a repository subfolder such as `https://name.github.io/pocket/`.

**This update needs all the app files, not just index.html.** Offline launching requires a real service worker file. Existing workspace files are retained when upgrading on the same site address/browser; the IndexedDB schema is migrated without deleting them.

## Public uploads: one-time setup by the site owner

GitHub Pages serves static files; it cannot save visitor uploads into a shared database by itself. This package uses one Supabase project shared by all visitors. The download does not create or connect a real Supabase project for you.

1. Create a project at https://supabase.com/dashboard .
2. Open the project's **SQL Editor**, paste the contents of `supabase-setup.sql`, and run it. It creates the `pocket_html` table, public-read/owner-delete rules, and the publishing function. Do not skip this step.
3. Enable **Email/password** sign-in and new-user signups under Authentication. Set **Site URL** under URL Configuration to your actual GitHub Pages address, including the repository path and trailing slash. Keep email confirmation enabled for a public site.
4. Configure **custom SMTP** for signup confirmation email. Supabase's default mail service only sends to pre-authorized team addresses, so arbitrary visitors cannot complete signup with the default email service. Instructions: https://supabase.com/docs/guides/auth/auth-smtp . For initial testing before SMTP is configured, create an auto-confirmed email/password user in the project's Authentication → Users screen, and sign in with it.
5. Copy the project's **URL** and **publishable key** from its Connect dialog or API Keys settings. Edit `config.js`:

   ```js
   window.POCKET_CONFIG = Object.freeze({
     supabaseUrl: "https://YOUR-PROJECT.supabase.co",
     supabasePublishableKey: "sb_publishable_YOUR_KEY"
   });
   ```

   The publishable key is meant for browser code. **Never use a secret key or a service_role key.** This app deliberately accepts the current `sb_publishable_` key format.
6. Upload the edited `config.js` to GitHub with the other app files. Refresh the hosted page while online. Go to **Public**, sign in, and upload an HTML.
7. Open the same site in another browser, without signing in. Your upload should appear in **Public**. Press **Refresh** to see new versions.

Visitors can browse, run, edit a local copy, or save public files offline without signing in. Publishing and deleting require an account. Emails are not shown in the gallery; authors choose a public display name. The same configured site/database is shared across devices and networks.

### Publishing and updates

- Upload directly from **Public → Upload HTML**, or select an HTML in **Workspace → Publish**.
- An upload includes the HTML plus sibling CSS/JavaScript/images already imported into your workspace. Dynamic imports, build-tool projects, nested directories, and local runtime fetches are not bundled.
- Public HTMLs have a **2 MB** limit, a maximum of **20 uploads per account**, and a 10-second interval between publishes. The database enforces these limits.
- To update your own public HTML: **Public → Edit a copy**, edit it, and **Publish**. Its version number increases. You can also choose to publish it as a separate HTML.
- Edits in your workspace remain private until you publish. Other users cannot overwrite or delete your uploads.
- Offline snapshots are separate. Updating or deleting a public upload never changes a copy someone already saved.
- The owner can moderate/delete public uploads in the Supabase table editor. Published content is public and downloadable. Auth and database quotas are those of your Supabase project; there is no promise of unlimited storage or traffic.

## Offline mode: no Supabase required

### Save an exact version

1. While connected, import or select an HTML in **Workspace** and click **Save offline**. Alternatively choose **Save offline** in Public, or **Offline → Preload HTML**.
2. The app embeds available CSS, JavaScript, images, audio, and font assets. Missing assets or cross-origin download failures stop the save with an explanation.
3. Review any limitations, then click **Save this copy**.
4. In Offline, press **Run offline** to check the copy. Wait for **App ready to open offline** before disconnecting.
5. Turn off the device's connection and reopen the **same site URL in the same browser**. The cached app and saved copies still open. Bookmark that address; on supported devices you can add it to the home screen.

Copies never refresh on startup, reconnect, public refresh, or app update. **Replace copy** is a deliberate, confirmed action. Download exports the frozen HTML for an extra backup. **Edit a copy** creates a separate workspace file.

**Use offline mode** disables the app's gallery/auth/peer actions even while the device is connected. Turning it off enables online features again; it does not update saved HTMLs. Actual disconnection is also detected automatically.

### What offline saving can and cannot do

- Self-contained HTML games/tools are the best fit. Classic external scripts and static assets can be bundled when their server permits cross-origin downloads.
- Import sibling files together before saving. Only flat, basic relative references are supported. Prefer single-file HTML exports for complex projects.
- Runtime `fetch`, WebSockets, APIs, remote databases, dynamically loaded assets, JavaScript module dependencies, and online multiplayer do not become offline services. Such functions may stop working offline.
- Offline previews block API connections and remote resource loading with a content security policy. External links, form submissions, and nested pages/plugins are disabled or removed. The frozen source is therefore an offline bundle, not a byte-for-byte copy of the original; Download from Workspace preserves the editable source.
- Imported/public code runs in an isolated iframe with no access to the app's account session or stored workspace. Preview localStorage/cookies are unavailable, so games needing those APIs for their own progress saves may not work. Browser execution support varies.
- Maximum bundled offline HTML size: **25 MB per copy**. Browser quota is separate and can fill up. A failed replacement keeps the previous copy intact.
- The shelf belongs to the current browser/device/profile. Private browsing, clearing site data, uninstalling a home-screen app, or browser storage eviction can remove it. **Keep storage on this device** asks the browser for persistent storage; it is not guaranteed. Download important copies.
- The app shell may update while online. Frozen HTML snapshots never do.

## Existing features

- HTML/CSS/JavaScript editing and embedded execution, file imports/downloads, and browser workspace persistence.
- Images, audio, video, PDF (browser-dependent), and text previews.
- Peer-to-peer text/file sharing by connection code, up to 100 MB per file. Internet is needed for PeerJS signaling and STUN. Same Wi-Fi does not guarantee that a firewall permits WebRTC. No automatic network discovery or TURN relay is configured.
- Public-gallery storage is Supabase. Peer transfer contents do not pass through Supabase or GitHub.

## Troubleshooting

- **Public gallery isn't set up:** fill `config.js` with the project URL and browser-safe publishable key; upload it and refresh online.
- **Table/function not found:** run `supabase-setup.sql` in the same Supabase project as the configured URL/key.
- **Signup email not arriving:** configure custom SMTP, verify the sender/domain settings, and check Auth logs. The app does not bypass email confirmation.
- **Confirm your email:** use the email link, then return to Public and sign in with your password.
- **Newer version was published:** reopen the public item to get its latest version, then apply your edits. Stale versions never silently overwrite newer ones.
- **Offline setup incomplete:** check all eight app files were uploaded in the same directory. Open the hosted HTTPS URL online, refresh, and press Check readiness. Opening an HTML by double-clicking it is not sufficient for service-worker installation.
- **Missing local asset:** import that asset into Workspace, then retry Save offline. A ZIP file is not automatically unpacked.
- **Could not preload URL:** the remote asset may not allow CORS, may require login, or may be unavailable. Use a self-contained HTML with embedded assets.

## Verification performed

- Browser tests: editor/preview, persistence, offline shell installation, full offline reload, frozen version unchanged after source edits, sibling CSS/JS bundled and running offline, missing-asset save rejected, and mobile layout.
- Public UI tests against a simulated API: sign-in, publishing, second-browser public visibility, editing/version update, and preservation of snapshots after public update/deletion.
- Actual PostgreSQL tests using PGlite: SQL installs, authenticated publishing, owner update/versioning, non-owner update/delete denial, public reading, and anonymous publish denial.
- A live Supabase project and real signup email delivery were not provisioned or tested; those require the owner's setup above.

## Reference documentation

- GitHub Pages: https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site
- Supabase browser keys: https://supabase.com/docs/guides/getting-started/api-keys
- Supabase row-level security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase email/password auth: https://supabase.com/docs/guides/auth/passwords
- Service workers: https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers
