document.addEventListener('DOMContentLoaded', function () {

  const SUPABASE_URL = 'https://icebgysininolvjbueet.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_h654diItHmAibeSCRd1y6w_iyLyPB-4';

  const client = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
  );

  const liveCard = document.getElementById('liveMatchPageCard');
  const noLive = document.getElementById('noLiveMatch');

  function oversFromBalls(balls) {
    balls = balls || 0;
    return Math.floor(balls / 6) + '.' + (balls % 6);
  }

  function renderMatch(match) {

    if (!match || match.status !== 'live') {
      liveCard.style.display = 'block';
      document.getElementById('liveMatchDetails').hidden = true;
      document.getElementById('liveEmptyMessage').textContent = 'Live match will be shown here.';
      noLive.style.display = 'block';
      return;
    }

    liveCard.style.display = 'block';
    noLive.style.display = 'none';
    document.getElementById('liveMatchDetails').hidden = false;

    document.getElementById('pageLiveStatus').textContent =
      match.status === 'finished' ? 'FINAL' : 'LIVE';

    document.getElementById('pageInnings').textContent =
      match.innings === 2 ? '2nd Innings' : '1st Innings';

    document.getElementById('pageBattingTeam').textContent =
      match.batting_team || 'Team';

    document.getElementById('pageBowlingTeam').textContent =
      match.bowling_team || 'Team';

    document.getElementById('pageRuns').textContent =
      match.runs || 0;

    document.getElementById('pageWickets').textContent =
      match.wickets || 0;

    document.getElementById('pageOvers').textContent =
      oversFromBalls(match.legal_balls);


    const targetWrap =
      document.getElementById('pageTargetWrap');

    const chaseText =
      document.getElementById('pageChaseText');


    if (match.innings === 2 && match.target) {

      targetWrap.hidden = false;

      document.getElementById('pageTarget').textContent =
        match.target;

      const runsNeeded =
        Math.max(0, match.target - match.runs);

      const totalBalls =
        (match.overs_limit || 4) * 6;

      const ballsLeft =
        Math.max(0, totalBalls - match.legal_balls);


      if (match.status === 'finished') {

        chaseText.hidden = false;

        chaseText.textContent =
          match.winner === 'Tie'
            ? 'Match tied'
            : match.winner
            ? match.winner + ' won the match'
            : 'Match finished';

      }
      else {

        chaseText.hidden = false;

        chaseText.textContent =
          'Need ' +
          runsNeeded +
          ' runs from ' +
          ballsLeft +
          ' balls';

      }

    }
    else {

      targetWrap.hidden = true;
      chaseText.hidden = true;

    }

  }


  async function loadMatch() {

    const { data, error } =
      await client
        .from('live_match')
        .select('*')
        .eq('id', 1)
        .maybeSingle();

    if (error) {
      console.error(error);
      document.getElementById('liveEmptyMessage').textContent = 'Live score is temporarily unavailable. Please refresh to retry.';
      return;
    }

    renderMatch(data);

  }


  loadMatch();


  client
    .channel('powerhitters-live-page')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'live_match',
        filter: 'id=eq.1'
      },
      function (payload) {

        renderMatch(payload.new);

      }
    )
    .subscribe();

});
