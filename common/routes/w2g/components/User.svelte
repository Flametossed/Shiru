<script>
  import { click } from '@/modules/lib/click.js'
  import { COMMON } from '@/modules/bridge.js'
  import { ExternalLink } from 'lucide-svelte'

  /** @type {import('@/modules/providers/anilist/al.d.ts').Viewer | import('@/modules/providers/myanimelist/mal.d.ts').Viewer | {}} */
  export let user = {}
</script>

<div class='d-flex align-items-center pb-10'>
  <img src={user?.avatar?.medium || user?.picture || 'https://s4.anilist.co/file/anilistcdn/user/avatar/large/default.png'} alt='ProfilePicture' class='w-50 h-50 rounded-circle p-5 mt-auto' />
  <div class='font-size-18 line-height-normal pl-5'>
    {user?.name || 'Anonymous'}
  </div>
  {#if user?.name}
    <span class='pointer text-primary d-flex align-items-center ml-auto' use:click={() => COMMON.openURI((user?.avatar?.medium ? 'https://anilist.co/user/' : 'https://myanimelist.net/profile/') + user.name)}>
      <ExternalLink size='2rem' />
    </span>
  {/if}
</div>
