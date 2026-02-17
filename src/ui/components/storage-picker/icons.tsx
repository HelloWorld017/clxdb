type IconProps = {
  className?: string;
};

export const FolderIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
    <title>FileSystem Access API</title>
    <path
      d="M3.5 7.75a2.25 2.25 0 0 1 2.25-2.25h4.25l1.8 1.8h6.45a2.25 2.25 0 0 1 2.25 2.25v8.7a2.25 2.25 0 0 1-2.25 2.25H5.75a2.25 2.25 0 0 1-2.25-2.25v-10.5Z"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const DatabaseIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
    <title>OPFS</title>
    <ellipse cx="12" cy="6" rx="7.5" ry="2.75" strokeWidth={1.5} />
    <path
      d="M4.5 6v5.75c0 1.52 3.36 2.75 7.5 2.75s7.5-1.23 7.5-2.75V6M4.5 11.75v5.75c0 1.52 3.36 2.75 7.5 2.75s7.5-1.23 7.5-2.75v-5.75"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const LinkIcon = ({ className }: IconProps) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <title>WebDAV</title>
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);
