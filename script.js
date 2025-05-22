// YouTube IFrame Player APIを読み込むための準備
// このスクリプトはYouTubeの動画プレイヤーをウェブページに埋め込むために必要です。
var tag = document.createElement('script');
tag.src = "http://www.youtube.com/iframe_api"; // YouTube IFrame Player APIの公式URL
var firstScriptTag = document.getElementsByTagName('script')[0];
firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

// あなたのYouTube Data APIキーをここに貼り付けます。
// このキーはGoogle Cloud Consoleで取得し、ウェブサイト制限を設定する必要があります。
const API_KEY = 'AIzaSyAtASunKOOifOJBvRctJ6o2ILa5D_JgaJw'; // ★★★ここをあなたのAPIキーに貼り付けてください！★★★

// アプリケーションが最初に動画を検索する際のキーワードを設定します。
// ユーザーの好みに合わせて変更できます。
const INITIAL_SEARCH_QUERY = '国債'; // 初期に検索するキーワード (例: '人気動画', '旅行', '経済' など)

// 動画プールと履歴を管理するための変数群
let videoPool = []; // 次に再生する動画の候補を一時的に保存する配列
let playedVideoIds = new Set(); // これまでに再生した動画のIDを記録するSet（重複なし）
let likedVideoIds = new Set();  // 「いいね」した動画のIDを記録するSet
let dislikedVideoIds = new Set(); // 「スキップ」した動画のIDを記録するSet
// let neverShowVideoIds = new Set(); // 「二度と表示しない」機能は削除されました
const currentPlayingVideoIdKey = 'currentPlayingVideoId'; // 現在再生中の動画IDをlocalStorageに保存するためのキー
let currentSearchQuery = INITIAL_SEARCH_QUERY; // 現在の検索に使用するクエリ（初期値はINITIAL_SEARCH_QUERY）

// HTML要素への参照を取得（動画のタイトルやチャンネル名を表示するため）
const videoTitleElement = document.getElementById('videoTitle');
const channelTitleElement = document.getElementById('channelTitle');

/**
 * ユーザーデータをブラウザのlocalStorageに保存する関数。
 * 再生履歴、いいね、スキップ、現在再生中の動画IDを保存します。
 * 「二度と表示しない」機能は削除されたため、関連するデータは保存されません。
 */
function saveUserData() {
    // Setオブジェクトは直接JSONに変換できないため、Arrayに変換してから保存
    localStorage.setItem('playedVideoIds', JSON.stringify(Array.from(playedVideoIds)));
    localStorage.setItem('likedVideoIds', JSON.stringify(Array.from(likedVideoIds)));
    localStorage.setItem('dislikedVideoIds', JSON.stringify(Array.from(dislikedVideoIds)));
    // localStorage.setItem('neverShowVideoIds', JSON.stringify(Array.from(neverShowVideoIds))); // 削除

    // 現在再生中の動画IDを保存（プレイヤーが準備できていて、動画がロードされている場合のみ）
    if (player && typeof player.getVideoData === 'function' && player.getVideoData() && player.getVideoData().video_id) {
        const currentVideoId = player.getVideoData().video_id;
        localStorage.setItem(currentPlayingVideoIdKey, currentVideoId);
    } else {
        // 動画が再生されていない場合は、以前の現在再生中の動画IDをクリア
        localStorage.removeItem(currentPlayingVideoIdKey);
    }
    console.log("ユーザーデータを保存しました！");
}

/**
 * ブラウザのlocalStorageからユーザーデータを読み込む関数。
 * 保存されたIDリストをSetオブジェクトとして復元します。
 * 「二度と表示しない」機能は削除されたため、関連するデータは読み込まれません。
 * @returns {string|null} 前回再生中だった動画のID、またはnull
 */
function loadUserData() {
    const storedPlayed = localStorage.getItem('playedVideoIds');
    const storedLiked = localStorage.getItem('likedVideoIds');
    const storedDisliked = localStorage.getItem('dislikedVideoIds');
    // const storedNeverShow = localStorage.getItem('neverShowVideoIds'); // 削除
    const storedCurrentVideoId = localStorage.getItem(currentPlayingVideoIdKey);

    if (storedPlayed) {
        playedVideoIds = new Set(JSON.parse(storedPlayed));
    }
    if (storedLiked) {
        likedVideoIds = new Set(JSON.parse(storedLiked));
    }
    if (storedDisliked) {
        dislikedVideoIds = new Set(JSON.parse(storedDisliked));
    }
    // if (storedNeverShow) { // 削除
    //     neverShowVideoIds = new Set(JSON.parse(storedNeverShow)); // 削除
    // }
    console.log("ユーザーデータを読み込みました！");
    return storedCurrentVideoId; // 前回再生中だった動画IDを返して、アプリ起動時に再開できるようにする
}

/**
 * YouTube Data APIを使って動画を検索し、動画プールに追加する関数。
 * @param {string} query 検索キーワード。空の場合は人気動画を取得。
 * @param {number} maxResults 取得する動画の最大数。
 * @returns {Promise<Array<Object>>} 新しく取得した動画の配列。
 */
async function fetchVideosFromYouTube(query = '', maxResults = 10) {
    let url;
    // 検索クエリがある場合はsearch APIを使用（キーワード検索）
    if (query) {
        url = `https://www.googleapis.com/youtube/v3/search?key=${API_KEY}&part=snippet&type=video&maxResults=${maxResults}&q=${encodeURIComponent(query)}&order=relevance`;
    } else {
        // クエリがない場合はvideos APIの人気動画チャートを使用
        url = `https://www.googleapis.com/youtube/v3/videos?key=${API_KEY}&part=snippet,contentDetails&chart=mostPopular&regionCode=JP&maxResults=${maxResults}`;
    }

    try {
        const response = await fetch(url); // YouTube APIにリクエストを送信
        const data = await response.json(); // レスポンスをJSON形式で解析

        // APIからのレスポンスに問題がないかチェック
        if (!data.items || !Array.isArray(data.items)) {
            console.warn("YouTube APIからのレスポンスに問題があります。itemsがありません。", data);
            // APIキーのエラーなど、致命的なエラーの場合はユーザーに通知する
            // alert('動画の読み込み中にエラーが発生しました。APIキーまたはネットワーク設定を確認してください。');
            return []; // 空の配列を返す
        }

        // 取得した動画をフィルタリングし、動画プールに追加
        const newVideos = data.items.map(item => ({
            id: item.id.videoId || item.id, // search.listとvideos.listでIDの場所が異なるため両方に対応
            title: item.snippet.title,
            thumbnail: item.snippet.thumbnails.medium.url, // ミディアムサイズのサムネイルURL
            tags: item.snippet.tags || [], // 動画のタグ情報（ない場合もある）
            channelTitle: item.snippet.channelTitle // チャンネル名
        })).filter(video =>
            // 有効なIDを持ち、かつまだ再生していない、スキップしていない動画のみを対象とする
            video.id && !playedVideoIds.has(video.id) && !dislikedVideoIds.has(video.id) // && !neverShowVideoIds.has(video.id) // 削除
        );
        
        videoPool = videoPool.concat(newVideos); // 新しい動画をプールに追加
        // プール内の動画に重複がないようにSetを使ってフィルタリング
        const uniqueVideoIdsInPool = new Set(videoPool.map(v => v.id));
        videoPool = Array.from(uniqueVideoIdsInPool).map(id => videoPool.find(v => v.id === id));

        console.log("動画を検索し、プールに追加しました。現在のプールサイズ:", videoPool.length);
        displayCandidateVideos(); // 候補動画の表示を更新
        return newVideos; // 新しく取得した動画のリストを返す

    } catch (error) {
        console.error("YouTube APIでの動画検索中にエラーが発生しました:", error);
        // APIキーのエラーなど、致命的なエラーの場合はユーザーに通知する
        // alert('動画の読み込み中にエラーが発生しました。APIキーまたはネットワーク設定を確認してください。');
        return []; // エラー時は空の配列を返す
    }
}

/**
 * 「いいね」した動画のタグやチャンネル名から、次の検索クエリを賢く生成する関数。
 * 関連性の高い動画を見つけやすくします。
 */
async function generateSmartSearchQuery() {
    // 「いいね」した動画がない場合は、初期の検索クエリを使用
    if (likedVideoIds.size === 0) {
        currentSearchQuery = INITIAL_SEARCH_QUERY;
        console.log("いいねした動画がないため、初期検索クエリを使用:", currentSearchQuery);
        return;
    }

    let allTags = []; // いいねした動画のすべてのタグを収集
    let channelTitles = new Set(); // いいねした動画のチャンネル名を収集（重複なし）
    const likedVideoIdsArray = Array.from(likedVideoIds);

    // YouTube Data APIのvideos.listを使って、いいねした動画の詳細情報（タグやチャンネル名）を取得
    // APIは一度に最大50件のIDしか受け付けないため、分割してリクエストを送信
    for (let i = 0; i < likedVideoIdsArray.length; i += 50) {
        const batchIds = likedVideoIdsArray.slice(i, i + 50);
        const url = `https://www.googleapis.com/youtube/v3/videos?key=${API_KEY}&part=snippet&id=${batchIds.join(',')}`;

        try {
            const response = await fetch(url);
            const data = await response.json();
            if (!data.items || !Array.isArray(data.items)) {
                console.warn("タグ/チャンネル取得APIからのレスポンスに問題があります。itemsがありません。", data);
                continue; // 次のバッチへスキップ
            }
            data.items.forEach(item => {
                if (item.snippet) {
                    if (item.snippet.tags) {
                        allTags = allTags.concat(item.snippet.tags); // タグを追加
                    }
                    if (item.snippet.channelTitle) {
                        channelTitles.add(item.snippet.channelTitle); // チャンネル名を追加
                    }
                }
            });
        } catch (error) {
            console.error("いいねした動画のタグ/チャンネル取得中にエラーが発生しました:", error);
        }
    }

    // 最も頻繁に出てくるタグをいくつか選ぶ（例: 出現頻度が高い上位3つ）
    const tagCounts = {};
    allTags.forEach(tag => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    });

    const sortedTags = Object.keys(tagCounts).sort((a, b) => tagCounts[b] - tagCounts[a]);
    const topTags = sortedTags.slice(0, 3); // 上位3つのタグを選択

    // チャンネル名と上位タグを組み合わせて新しい検索クエリを生成
    let smartQueryParts = [];
    if (channelTitles.size > 0) {
        // チャンネル名がある場合は、まずチャンネル名を優先してクエリに含める
        smartQueryParts = Array.from(channelTitles).slice(0, 2); // 上位2つのチャンネル名
        // 残りの枠にタグを追加（最大3つのキーワードになるように調整）
        smartQueryParts = smartQueryParts.concat(topTags.slice(0, 3 - smartQueryParts.length));
    } else {
        // チャンネル名がない場合は、タグのみを使用
        smartQueryParts = topTags;
    }

    if (smartQueryParts.length > 0) {
        // 選ばれたキーワードをスペースでつなげて新しい検索クエリにする
        currentSearchQuery = smartQueryParts.join(' ');
        console.log("いいねした動画から生成された検索クエリ:", currentSearchQuery);
    } else {
        // タグもチャンネル名も見つからない場合は、初期の検索クエリに戻す
        currentSearchQuery = INITIAL_SEARCH_QUERY;
        console.log("いいねした動画から適切な検索クエリを生成できませんでした。初期検索クエリに戻します:", currentSearchQuery);
    }
}

/**
 * 動画プールから次の動画を選び、プレイヤーで再生する関数。
 * プールが空の場合は、新しい動画を検索して補充します。
 */
async function playNextVideo() {
    let nextVideo = null;

    // まず動画プールから、まだ再生していない、スキップしていない動画を探す
    // プールが空になるまで、または有効な動画が見つかるまでループ
    while (videoPool.length > 0) {
        const candidate = videoPool.shift(); // プールから最初の動画を取り出す
        if (candidate && candidate.id && !playedVideoIds.has(candidate.id) && !dislikedVideoIds.has(candidate.id)) { // && !neverShowVideoIds.has(candidate.id) // 削除
            nextVideo = candidate; // 有効な動画が見つかったらループを抜ける
            break;
        }
    }

    // プールに有効な動画がない場合、または全て再生済み/スキップ済みの場合
    if (!nextVideo) {
        console.log("動画プールが空です。新しい動画を検索します。");
        await generateSmartSearchQuery(); // まずスマートな検索クエリを生成

        // 新しい動画をフェッチし、その中から有効なものを探す
        const fetchedVideos = await fetchVideosFromYouTube(currentSearchQuery, 20); // 生成されたクエリで20件取得を試みる

        // フェッチした動画の中から再生できるものを探す
        while (fetchedVideos.length > 0) {
            const candidate = fetchedVideos.shift();
            if (candidate && candidate.id && !playedVideoIds.has(candidate.id) && !dislikedVideoIds.has(candidate.id)) { // && !neverShowVideoIds.has(candidate.id) // 削除
                nextVideo = candidate; // 有効な動画が見つかったらループを抜ける
                break;
            }
        }

        // それでも動画が見つからない場合は、最終手段として初期検索クエリで再度試す
        if (!nextVideo) {
            console.warn("新しい動画をフェッチしましたが、再生可能な動画が見つかりませんでした。再度初期クエリで試します。");
            await fetchVideosFromYouTube(INITIAL_SEARCH_QUERY, 10); // 初期クエリで10件取得を試みる
            // 再度プールから取得を試みる
            while (videoPool.length > 0) {
                const candidate = videoPool.shift();
                if (candidate && candidate.id && !playedVideoIds.has(candidate.id) && !dislikedVideoIds.has(candidate.id)) { // && !neverShowVideoIds.has(candidate.id) // 削除
                    nextVideo = candidate;
                    break;
                }
            }
        }
        
        // 最終的に再生可能な動画が見つからなかった場合の処理
        if (!nextVideo) {
            console.error("再生可能な動画が見つかりませんでした。");
            videoTitleElement.textContent = "動画が見つかりませんでした。";
            channelTitleElement.textContent = "検索キーワードを変更してみてください。";
            return; // これ以上処理を続行しない
        }
    }

    // YouTubeプレイヤーが準備できていて、次の動画が有効な場合のみ再生処理を行う
    if (player && typeof player.loadVideoById === 'function' && nextVideo && nextVideo.id) {
        player.loadVideoById(nextVideo.id); // 動画をロードして再生
        playedVideoIds.add(nextVideo.id); // 再生した動画としてIDを記録
        saveUserData(); // ユーザーデータを保存
        displayCandidateVideos(); // 候補動画の表示を更新

        // 動画のタイトルとチャンネル名を表示
        videoTitleElement.textContent = nextVideo.title;
        channelTitleElement.textContent = nextVideo.channelTitle;

    } else {
        console.error("次の動画が見つからないか、プレイヤーが準備できていません。", nextVideo);
        videoTitleElement.textContent = "動画の読み込みに失敗しました";
        channelTitleElement.textContent = "チャンネル情報なし";
    }
}

/**
 * 動画プール内の候補動画をHTMLに表示する関数。
 * ユーザーが次に視聴したい動画を選べるようにします。
 */
function displayCandidateVideos() {
    const candidateContainer = document.getElementById('候補動画を表示する場所'); // HTMLのidと合わせる
    if (!candidateContainer) {
        console.warn("ID '候補動画を表示する場所' を持つ要素が見つかりませんでした。");
        return;
    }
    candidateContainer.innerHTML = ''; // 一度現在の表示をクリア

    // プールから、まだ表示されていない、再生済み/スキップ済み動画を除外し、最大6件表示
    const uniqueCandidates = [];
    const displayedIds = new Set();
    // videoPoolはshiftで要素が減っていくため、ここではコピーしてループ処理を行う
    const currentPool = Array.from(videoPool); 
    for (const video of currentPool) {
        if (video && video.id && !playedVideoIds.has(video.id) && !dislikedVideoIds.has(video.id) && !displayedIds.has(video.id)) { // && !neverShowVideoIds.has(video.id) // 削除
            uniqueCandidates.push(video);
            displayedIds.add(video.id);
        }
        if (uniqueCandidates.length >= 6) break; // 最大6件の候補を表示
    }

    uniqueCandidates.forEach(video => {
        const videoDiv = document.createElement('div');
        videoDiv.className = 'video-candidate'; // CSSでスタイルを適用するためのクラス
        videoDiv.dataset.videoId = video.id; // クリック時に動画IDがわかるようにデータ属性を設定

        videoDiv.innerHTML = `
            <img src="${video.thumbnail}" alt="${video.title}" class="rounded-md">
            <div class="video-candidate-title text-sm font-medium mt-1">${video.title}</div>
            <div class="video-candidate-channel text-xs text-gray-500">${video.channelTitle}</div>
        `;
        
        // 候補動画がクリックされたら、その動画を再生するイベントリスナー
        videoDiv.addEventListener('click', () => {
            if (player && typeof player.loadVideoById === 'function') { // プレイヤーが準備できているか確認
                player.loadVideoById(video.id); // クリックされた動画をロードして再生
                playedVideoIds.add(video.id); // 再生した動画として記録
                videoPool = videoPool.filter(v => v.id !== video.id); // クリック再生した動画をプールから削除
                saveUserData(); // ユーザーデータを保存
                displayCandidateVideos(); // 候補動画の表示を更新
            } else {
                console.error("プレイヤーが準備できていないため、動画を再生できません。");
            }
        });

        candidateContainer.appendChild(videoDiv); // コンテナに動画要素を追加
    });
}

// YouTubeプレイヤーオブジェクトのグローバル変数
var player;

/**
 * YouTube IFrame Player APIが読み込まれ、準備が完了したときに自動的に呼び出される関数。
 * YouTubeプレイヤーを初期化します。
 */
function onYouTubeIframeAPIReady() {
    const lastPlayedVideoId = loadUserData(); // ユーザーデータを読み込み、前回再生中の動画IDを取得

    player = new YT.Player('player', { // 'player'はHTML内の動画表示エリアのID
        height: '390', // プレイヤーの高さ
        width: '640',  // プレイヤーの幅
        // 初回ロード時は、前回再生していた動画があればそれを優先してロード
        // なければ、後でplayNextVideo()で適切な動画をロードするためのプレースホルダーID
        videoId: lastPlayedVideoId || 'initialLoadPlaceholder', 
        playerVars: {
            'autoplay': 1, // 自動再生を有効にする
            'mute': 1,     // 最初はミュートで開始する
            'controls': 1, // プレイヤーのコントロールを表示する
            'loop': 0,     // ループ再生を無効にする
            'rel': 0       // 関連動画の表示を無効にする
        },
        events: {
            'onReady': onPlayerReady,      // プレイヤーの準備が完了したときのイベント
            'onStateChange': onPlayerStateChange, // プレイヤーの状態が変化したときのイベント
            'onError': onPlayerError       // プレイヤーでエラーが発生したときのイベント
        }
    });
}

/**
 * YouTubeプレイヤーの準備が完了したときに呼び出される関数。
 * アプリの初期動画再生ロジックを制御します。
 * @param {Object} event YouTube Player APIからのイベントオブジェクト
 */
async function onPlayerReady(event) {
    console.log("YouTubeプレイヤーの準備ができました！");

    const lastPlayedVideoId = localStorage.getItem(currentPlayingVideoIdKey);

    // 前回再生していた動画があり、それがまだ再生済み/スキップ済みリストになければ再生を試みる
    if (lastPlayedVideoId && !playedVideoIds.has(lastPlayedVideoId) && !dislikedVideoIds.has(lastPlayedVideoId)) { // && !neverShowVideoIds.has(lastPlayedVideoId) // 削除
        player.loadVideoById(lastPlayedVideoId); // 前回再生していた動画をロード
        playedVideoIds.add(lastPlayedVideoId); // 再生した動画として記録
        // 動画データがロードされるまで少し待ってからタイトルなどを表示
        const checkVideoDataInterval = setInterval(() => {
            const videoData = player.getVideoData();
            if (videoData && videoData.title && videoData.author) {
                videoTitleElement.textContent = videoData.title;
                channelTitleElement.textContent = videoData.author;
                clearInterval(checkVideoDataInterval); // データが取得できたらインターバルをクリア
            }
        }, 100); // 100msごとにチェック

        saveUserData(); // ユーザーデータを保存
    } else {
        // 履歴がない、または履歴の動画が再生できない場合は、playNextVideoで新しい動画を探す
        console.log("初期動画または履歴の動画が見つからない、または再生できません。新しい動画を探します。");
        await playNextVideo(); // 次の動画を再生する関数を呼び出す
    }

    event.target.playVideo(); // 動画再生を開始

    // アプリ初期ロード時、または動画プールが少ない場合に、好みに合わせた新しい動画を検索してプールを補充
    await generateSmartSearchQuery(); // まず好みに合わせた検索クエリを生成（非同期処理なのでawaitで待つ）
    if (videoPool.length < 5) { // 動画プールが5件未満の場合に新しい動画を検索
        fetchVideosFromYouTube(currentSearchQuery, 20); // 生成されたクエリで20件取得を試みる
    }
}

/**
 * YouTubeプレイヤーの状態が変化したときに呼び出される関数。
 * 動画の終了、再生中などの状態変化に対応します。
 * @param {Object} event YouTube Player APIからのイベントオブジェクト
 */
function onPlayerStateChange(event) {
    if (event.data == YT.PlayerState.ENDED) {
        // 動画の再生が終了した場合
        console.log("動画の再生が終わりました。次の動画を探します...");
        playNextVideo(); // 次の動画を再生
    } else if (event.data == YT.PlayerState.PLAYING) {
        // 動画が再生中の場合、タイトルとチャンネル名を更新（確実な表示のため）
        const checkVideoDataInterval = setInterval(() => {
            const videoData = player.getVideoData();
            if (videoData && videoData.title && videoData.author) {
                videoTitleElement.textContent = videoData.title;
                channelTitleElement.textContent = videoData.author;
                clearInterval(checkVideoDataInterval);
            }
        }, 100); // 100msごとにチェック
    }
}

/**
 * YouTubeプレイヤーでエラーが発生したときに呼び出される関数。
 * エラーメッセージを表示し、次の動画の再生を試みます。
 * @param {Object} event YouTube Player APIからのイベントオブジェクト
 */
function onPlayerError(event) {
    console.error("YouTubeプレイヤーでエラーが発生しました。コード:", event.data);
    let errorMessage = "動画の読み込み中にエラーが発生しました。";
    // エラーコードに応じてユーザーフレンドリーなメッセージを表示
    switch (event.data) {
        case 2:
            errorMessage = "動画IDが正しくないか、動画が存在しません。";
            break;
        case 5:
            errorMessage = "HTML5プレイヤーのエラーです。";
            break;
        case 100:
            errorMessage = "動画が見つからないか、非公開です。";
            break;
        case 101:
        case 150:
            errorMessage = "埋め込みが許可されていないか、地域制限されています。";
            break;
    }
    videoTitleElement.textContent = errorMessage;
    channelTitleElement.textContent = "次の動画を自動で探します...";
    
    // エラーが発生した動画は「二度と表示しない」リストに追加し、次回以降表示しないようにする
    // if (player && typeof player.getVideoData === 'function' && player.getVideoData() && player.getVideoData().video_id) { // 削除
    //     const currentVideoId = player.getVideoData().video_id; // 削除
    //     if (currentVideoId && !neverShowVideoIds.has(currentVideoId)) { // 削除
    //         neverShowVideoIds.add(currentVideoId); // 削除
    //         playedVideoIds.add(currentVideoId); // 念のため再生済みにも追加してプールから除外されやすくする // 削除
    //         saveUserData(); // ユーザーデータを保存 // 削除
    //     } // 削除
    // } // 削除
    playNextVideo(); // 次の動画の再生を試みる
}

// --- ボタンイベントリスナー ---

// スキップボタンが押された時の処理
document.getElementById('skipButton').addEventListener('click', function() {
    if (player && typeof player.getVideoData === 'function') {
        const currentVideoId = player.getVideoData().video_id;
        if (currentVideoId && !dislikedVideoIds.has(currentVideoId)) { // 同じ動画を何度もスキップしないようにチェック
            dislikedVideoIds.add(currentVideoId); // スキップした動画として記録
            console.log("スキップボタンが押されました！動画ID:", currentVideoId);
            saveUserData(); // ユーザーデータを保存
            displayCandidateVideos(); // 候補動画の表示を更新
        }
    }
    playNextVideo(); // 次の動画を再生
});

// いいねボタンが押された時の処理
document.getElementById('likeButton').addEventListener('click', function() {
    if (player && typeof player.getVideoData === 'function') {
        const currentVideoId = player.getVideoData().video_id;
        if (currentVideoId && !likedVideoIds.has(currentVideoId)) { // 同じ動画を何度もいいねしないようにチェック
            likedVideoIds.add(currentVideoId); // いいねした動画として記録
            console.log("いいねボタンが押されました！動画ID:", currentVideoId);
            saveUserData(); // ユーザーデータを保存
            // いいねしたからといってすぐに次の動画には進まない（ユーザーの意図を尊重）
        }
    }
});

// 「この動画を二度と表示しない」ボタンが押された時の処理
// document.getElementById('neverShowButton').addEventListener('click', function() { // 削除
//     if (player && typeof player.getVideoData === 'function') { // 削除
//         const currentVideoId = player.getVideoData().video_id; // 削除
//         if (currentVideoId && !neverShowVideoIds.has(currentVideoId)) { // 削除
//             neverShowVideoIds.add(currentVideoId); // 二度と表示しないリストに追加 // 削除
//             playedVideoIds.add(currentVideoId); // 再生済みにも追加し、プールからも除外されやすくする // 削除
//             console.log("「この動画を二度と表示しない」ボタンが押されました！動画ID:", currentVideoId); // 削除
//             // alert('この動画は今後表示されなくなります。'); // ユーザーに通知 // 削除
//             // alert()は使えないので、代わりにメッセージボックスやモーダルUIを使うべきですが、今回はコンソールログのみ // 削除
//             saveUserData(); // ユーザーデータを保存 // 削除
//             displayCandidateVideos(); // 候補動画の表示を更新 // 削除
//         } // 削除
//     } // 削除
//     playNextVideo(); // 次の動画を再生 // 削除
// }); // 削除

// ページを閉じる前にデータを保存する（ブラウザタブを閉じる、F5以外でページ遷移など）
window.addEventListener('beforeunload', saveUserData);

