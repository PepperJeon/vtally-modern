import React from 'react'

function ExternalLink({className, ...rest}: React.ComponentProps<'a'>) {
    return (
        <a
            target="_blank"
            rel="noreferrer noopener"
            className={"text-text underline underline-offset-2 hover:text-white focus-visible:shadow-focus focus-visible:outline-none " + (className || "")}
            {...rest}
        />
    )
}

export default ExternalLink
