### The shared UI package declares Tailwind as a required peer without using it

**Location:** `21`

**Reason:** The package does rely on Tailwind-generated output.
`packages/ui/Container.svelte` renders utility classes such as `w-full`, `mx-auto`, `px-4`, `sm:px-6`, `lg:px-8`, and `max-w-screen-*`, so consumers need Tailwind available for that component to render correctly.
Because the source itself ships Tailwind utility class names, the `tailwindcss` peer dependency is not dead or unnecessary configuration.
