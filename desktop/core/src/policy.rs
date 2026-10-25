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
    AUTH_HOSTS.iter().any(|entry| {
        host == *entry || host.ends_with(&format!(".{entry}"))
    })
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
    if https
        && (same_origin(base, target)
            || target.host_str().is_some_and(is_auth_host))
    {
        return PopupDecision::InApp;
    }
    if external_scheme(target) {
        PopupDecision::External
    } else {
        PopupDecision::Deny
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn url(value: &str) -> Url {
        Url::parse(value).unwrap()
    }

    #[test]
    fn compares_origins() {
        let base = url("https://example.com/");
        assert!(same_origin(&base, &url("https://example.com/path?q=1")));
        assert!(!same_origin(&base, &url("http://example.com/")));
        assert!(!same_origin(&base, &url("https://www.example.com/")));
        assert!(!same_origin(&base, &url("https://example.com:8443/")));
    }

    #[test]
    fn recognizes_auth_hosts() {
        assert!(is_auth_host("accounts.google.com"));
        assert!(is_auth_host("login.microsoftonline.com"));
        assert!(is_auth_host("tenant.auth0.com"));
        assert!(is_auth_host("ACCOUNTS.GOOGLE.COM"));
        assert!(!is_auth_host("evil.example.com"));
        assert!(!is_auth_host("google.com.evil.example"));
    }

    #[test]
    fn decides_main_window_navigation() {
        let base = url("https://example.com/");
        assert_eq!(
            navigation_decision(&base, &url("https://example.com/other")),
            NavigationDecision::Allow
        );
        assert_eq!(
            navigation_decision(&base, &url("https://example.org/")),
            NavigationDecision::External
        );
        assert_eq!(
            navigation_decision(&base, &url("http://example.org/")),
            NavigationDecision::External
        );
        assert_eq!(
            navigation_decision(&base, &url("mailto:test@example.com")),
            NavigationDecision::External
        );
        assert_eq!(
            navigation_decision(&base, &url("tel:+15551234567")),
            NavigationDecision::External
        );
        assert_eq!(
            navigation_decision(&base, &url("javascript:alert(1)")),
            NavigationDecision::Deny
        );
        assert_eq!(
            navigation_decision(&base, &url("data:text/plain,hi")),
            NavigationDecision::Deny
        );
        assert_eq!(
            navigation_decision(&base, &url("file:///etc/passwd")),
            NavigationDecision::Deny
        );
    }

    #[test]
    fn decides_popups() {
        let base = url("https://example.com/");
        assert_eq!(
            popup_decision(&base, &url("about:blank")),
            PopupDecision::InApp
        );
        assert_eq!(
            popup_decision(&base, &url("https://example.com/login")),
            PopupDecision::InApp
        );
        assert_eq!(
            popup_decision(&base, &url("https://accounts.google.com/o/oauth2")),
            PopupDecision::InApp
        );
        assert_eq!(
            popup_decision(&base, &url("https://tenant.okta.com/")),
            PopupDecision::InApp
        );
        assert_eq!(
            popup_decision(&base, &url("https://example.org/")),
            PopupDecision::External
        );
        assert_eq!(
            popup_decision(&base, &url("http://example.org/")),
            PopupDecision::External
        );
        assert_eq!(
            popup_decision(&base, &url("mailto:test@example.com")),
            PopupDecision::External
        );
        assert_eq!(
            popup_decision(&base, &url("javascript:alert(1)")),
            PopupDecision::Deny
        );
        assert_eq!(
            popup_decision(&base, &url("data:text/plain,hi")),
            PopupDecision::Deny
        );
    }
}
