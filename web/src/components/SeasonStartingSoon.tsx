type SeasonStartingSoonProps = {
  multiline?: boolean;
};

/**
 * The only launch-gated "STARTING SOON" label used on the app home.
 * Keep its two call sites explicit: the rewards banner and standing panel.
 */
export default function SeasonStartingSoon({ multiline = false }: SeasonStartingSoonProps) {
  return multiline ? (
    <>STARTING<br />SOON</>
  ) : (
    <>STARTING SOON</>
  );
}
