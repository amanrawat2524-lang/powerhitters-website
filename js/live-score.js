document.addEventListener('DOMContentLoaded', function () {

  const SUPABASE_URL = 'https://icebgysininolvjbueet.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_h654diItHmAibeSCRd1y6w_iyLyPB-4';

  if (!window.supabase) return;

  const client = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
  );

  const banner = document.getElementById('liveMatchBanner');
  const bannerText = document.getElementById('liveBannerText');

  function updateBanner(match) {

    if (!banner || !bannerText) return;

    if (!match || match.status !== 'live') {
      banner.hidden = true;
      return;
    }

    banner.hidden = false;

    const battingTeam = match.batting_team || 'Team';
    const bowlingTeam = match.bowling_team || 'Team';
    const runs = match.runs || 0;
    const wickets = match.wickets || 0;

    bannerText.textContent =
      'LIVE NOW — ' +
      battingTeam +
      ' ' +
      runs +
      '/' +
      wickets +
      ' vs ' +
      bowlingTeam +
      ' — VIEW MATCH';
  }

  async function loadLiveMatch() {

    const { data, error } = await client
      .from('live_match')
      .select('*')
      .eq('id', 1)
      .maybeSingle();

    if (error) {
      console.error('Live score error:', error);
      return;
    }

    updateBanner(data);
  }

  loadLiveMatch();

  client
    .channel('powerhitters-live-banner')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'live_match',
        filter: 'id=eq.1'
      },
      function (payload) {
        updateBanner(payload.new);
      }
    )
    .subscribe();

});
