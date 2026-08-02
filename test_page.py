"""Test the TaskFlow page loading"""
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()

    console_logs = []
    page_errors = []
    page.on('console', lambda msg: console_logs.append(f"[{msg.type}] {msg.text}"))
    page.on('pageerror', lambda err: page_errors.append(str(err)))

    print("Navigating to http://localhost:5173/...")
    try:
        page.goto('http://localhost:5173/', timeout=15000)
        page.wait_for_load_state('networkidle', timeout=10000)
        page.wait_for_timeout(2000)
    except Exception as e:
        print(f"Navigation error: {e}")

    print(f"\nPage title: {page.title()}")
    print(f"Page URL: {page.url}")

    # Check for auth page
    has_login = page.locator('text=登录').count()
    has_signup = page.locator('text=注册').count()
    has_taskflow = page.locator('text=TaskFlow').count()
    print(f"\nLogin button: {has_login}")
    print(f"Signup button: {has_signup}")
    print(f"TaskFlow text: {has_taskflow}")

    # Screenshot
    page.screenshot(path='/workspace/page_screenshot.png', full_page=True)
    print("\nScreenshot saved to /workspace/page_screenshot.png")

    # Check body content
    body = page.locator('body').inner_text()
    print(f"\nBody text (first 800 chars):\n{body[:800]}")

    print("\n--- Console Logs ---")
    for log in console_logs:
        print(log)

    print("\n--- Page Errors ---")
    for err in page_errors:
        print(err)

    browser.close()
    print("\n--- Done ---")