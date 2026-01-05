document.addEventListener('DOMContentLoaded', () => {
    
    // --- 1. Dynamic Footer Date ---
    const yearSpan = document.getElementById('copyright-year');
    if (yearSpan) {
        const startYear = 2025;
        const currentYear = new Date().getFullYear();
        if (currentYear > startYear) {
            // This updates the text to "2025–current year" automatically
            yearSpan.textContent = `${startYear}–${currentYear}`;
        }
    }

    // --- 2. Hamburger Menu (Moved from index.html) ---
    const hamburger = document.querySelector(".hamburger");
    const navLinks = document.querySelector(".nav-links");

    if (hamburger && navLinks) {
        hamburger.addEventListener("click", () => {
            hamburger.classList.toggle("active");
            navLinks.classList.toggle("active");
        });

        document.querySelectorAll(".nav-links li a").forEach(n => n.addEventListener("click", () => {
            hamburger.classList.remove("active");
            navLinks.classList.remove("active");
        }));
    }

    // --- 3. Scroll Animations (Moved from index.html) ---
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);

    document.querySelectorAll('.card').forEach(card => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(30px)';
        card.style.transition = 'opacity 0.6s, transform 0.6s';
        observer.observe(card);
    });
});
