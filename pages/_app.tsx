import Head from "next/head"
import { css, Global } from "@emotion/react"

function MyApp({ Component, pageProps }) {
  return (
    <>
      <Head>
        <link
          href="https://fonts.googleapis.com/css2?family=Rubik:wght@300;400;500;700&display=swap"
          rel="stylesheet"
        />
      </Head>
      <Global
        styles={css`
          *,
          body,
          *:before,
          *:after {
            margin: 0;
            box-sizing: border-box;
          }
        `}
      />
      <Component {...pageProps} />
    </>
  )
}

export default MyApp
