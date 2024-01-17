import { Slot, component$, useComputed$ } from "@builder.io/qwik";
import { Link, useLocation, type LinkProps } from "@builder.io/qwik-city";
import { cn } from "~/util";

type NavLinkProps = LinkProps & {
  activeClass?: string;
  inactiveClass?: string;
};

export const NavLink = component$((props: NavLinkProps) => {
  const location = useLocation();
  const className = useComputed$(() => {
    const toPathname = props.href ?? "";
    const locationPathname = location.url.pathname;

    const startSlashPosition =
      toPathname !== "/" && toPathname.startsWith("/")
        ? toPathname.length - 1
        : toPathname.length;
    const endSlashPosition =
      toPathname !== "/" && toPathname.endsWith("/")
        ? toPathname.length - 1
        : toPathname.length;
    const isActive =
      locationPathname === toPathname ||
      (locationPathname.endsWith(toPathname) &&
        (locationPathname.charAt(endSlashPosition) === "/" ||
          locationPathname.charAt(startSlashPosition) === "/"));

    return cn(props.class, isActive ? props.activeClass : props.inactiveClass);
  });

  return (
    <Link {...props} class={className.value}>
      <Slot />
    </Link>
  );
});
