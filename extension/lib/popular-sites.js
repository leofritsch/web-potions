// Sites where an AI doesn't have to ask first, unless the user switches this off in Settings.
// Left out on purpose: email, banks and payments, dedicated sign-in sites, health, government,
// and hosts where anyone can publish their own pages (so substack.com, not *.substack.com).
(function (WP) {
  WP.popularSites = [
    // Search
    'google.com/*', 'bing.com/*', 'duckduckgo.com/*', 'yahoo.com/*', 'baidu.com/*', 'naver.com/*', 'yandex.com/*',
    // Video and music
    'youtube.com/*', 'm.youtube.com/*', 'music.youtube.com/*', 'twitch.tv/*', 'vimeo.com/*', 'dailymotion.com/*', 'open.spotify.com/*', 'soundcloud.com/*', 'netflix.com/*', 'primevideo.com/*', 'disneyplus.com/*', 'hulu.com/*', 'tiktok.com/*',
    // Social
    '*.reddit.com/*', 'x.com/*', 'twitter.com/*', 'facebook.com/*', 'instagram.com/*', 'linkedin.com/*', 'pinterest.com/*', 'tumblr.com/*', 'quora.com/*', 'threads.com/*', 'bsky.app/*',
    // Knowledge and code
    '*.wikipedia.org/*', 'stackoverflow.com/*', '*.stackexchange.com/*', 'medium.com/*', 'substack.com/*', 'github.com/*', 'gitlab.com/*', 'imdb.com/*', 'goodreads.com/*', 'britannica.com/*', 'w3schools.com/*', 'developer.mozilla.org/*', 'npmjs.com/*', 'producthunt.com/*', 'news.ycombinator.com/*',
    // News
    'bbc.com/*', 'bbc.co.uk/*', 'cnn.com/*', 'theguardian.com/*', 'reuters.com/*', 'apnews.com/*', 'forbes.com/*', 'businessinsider.com/*', 'theverge.com/*', 'techcrunch.com/*', 'wired.com/*', 'arstechnica.com/*', 'engadget.com/*', 'cnet.com/*', 'foxnews.com/*', 'nbcnews.com/*', 'npr.org/*', 'usatoday.com/*', 'time.com/*', 'huffpost.com/*', 'buzzfeed.com/*', 'vice.com/*',
    // Shopping
    'amazon.com/*', 'amazon.co.uk/*', 'amazon.de/*', 'amazon.fr/*', 'ebay.com/*', 'etsy.com/*', 'walmart.com/*', 'target.com/*', 'bestbuy.com/*', 'ikea.com/*', 'aliexpress.com/*', 'temu.com/*', 'shein.com/*',
    // Travel, local and jobs
    'booking.com/*', 'airbnb.com/*', 'tripadvisor.com/*', 'expedia.com/*', 'yelp.com/*', '*.craigslist.org/*', 'zillow.com/*', 'indeed.com/*', 'glassdoor.com/*',
    // Sport, weather and games
    'espn.com/*', 'weather.com/*', 'store.steampowered.com/*', 'roblox.com/*', 'ign.com/*',
    // Pictures, learning and big brands
    'imgur.com/*', '9gag.com/*', 'unsplash.com/*', 'deviantart.com/*', 'coursera.org/*', 'udemy.com/*', 'khanacademy.org/*', 'duolingo.com/*', 'apple.com/*', 'microsoft.com/*', 'nationalgeographic.com/*',
    // Ours
    '*.experimentempire.com/*',
  ];
})((self.WP = self.WP || {}));
