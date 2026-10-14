import './globals.css';

export const metadata = {
    title: 'Call summaries',
    description: 'Dialer calls, transcripts and summaries',
    icons: { icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📞</text></svg>" },
};

export default function RootLayout({ children }) {
    return (
        <html lang="en">
            <head>
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
                <link
                    rel="stylesheet"
                    href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=Noto+Sans+Devanagari:wght@400;500&display=swap"
                />
            </head>
            <body>{children}</body>
        </html>
    );
}
