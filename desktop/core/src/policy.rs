use url::Url;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NavigationDecision {
    Allow,
    External,
    Deny,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PopupDecision {
    InApp,
    External,
    Deny,
}

const AUTH_HOSTS: &[&str] = &[
    "accounts.google.com",
    "appleid.apple.com",
    "login.microsoftonline.com",
    "github.com",
    "gitlab.com",
    "auth0.com",
    "okta.com",
    "facebook.com",
    "x.com",
    "twitter.com",
];

pub fn same_origin(left: &Url, right: &Url) -> bool {
    left.origin() == right.origin()
}

pub fn is_auth_host(host: &str) -> bool {
    let host = host.to_ascii_lowercase();
    AUTH_HOSTS
        .iter()
        .any(|entry| host == *entry || host.ends_with(&format!(".{entry}")))
}

fn external_scheme(url: &Url) -> bool {
    matches!(url.scheme(), "http" | "https" | "mailto" | "tel")
}

pub fn navigation_decision(base: &Url, target: &Url) -> NavigationDecision {
    if same_origin(base, target) {
        NavigationDecision::Allow
    } else if external_scheme(target) {
        NavigationDecision::External
    } else {
        NavigationDecision::Deny
    }
}

pub fn popup_decision(base: &Url, target: &Url) -> PopupDecision {
    if target.as_str() == "about:blank" {
        return PopupDecision::InApp;
    }
    let https = target.scheme() == "https";
    if https && (same_origin(base, target) || target.host_str().is_some_and(is_auth_host)) {
        return PopupDecision::InApp;
    }
    if external_scheme(target) {
        PopupDecision::External
    } else {
        PopupDecision::Deny
    }
}
