// client/src/pages/Home.jsx
import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Home.css';


const Home = () => {
  
  const navigate = useNavigate();

  useEffect(() => {
    const observerOptions = {
      root: null,
      rootMargin: '0px',
      threshold: 0.1
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
        }
      });
    }, observerOptions);

    const elements = document.querySelectorAll('.animate-on-scroll');
    elements.forEach((el) => observer.observe(el));

    return () => {
      elements.forEach((el) => observer.unobserve(el));
    };
  }, []);

  const doctors = [
    { 
      name: "Dr. Elena Gilbert", 
      role: "Senior Embryologist", 
      image: "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&q=80&w=400&h=400" 
    },
    { 
      name: "Dr. Stefan Salvatore", 
      role: "IVF Specialist", 
      image: "https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?auto=format&fit=crop&q=80&w=400&h=400" 
    },
    { 
      name: "Dr. Caroline Forbes", 
      role: "Reproductive Surgeon", 
      image: "https://images.unsplash.com/photo-1594824476967-48c8b964273f?auto=format&fit=crop&q=80&w=400&h=400" 
    },
    { 
      name: "Dr. Alaric Saltzman", 
      role: "Andrologist", 
      image: "https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&q=80&w=400&h=400" 
    }
  ];

  return (
    <div className="home-container">
      
      {/* --- HERO SECTION --- */}
      <section className="hero-section">
        <div className="hero-bg-shape"></div>
        <div className="content-wrapper hero-grid">
          <div className="hero-text animate-on-scroll slide-up">
            <span className="badge">#1 Fertility Center</span>
            <h1>
              Begin Your Journey to <br />
              <span className="text-gradient">Parenthood</span>
            </h1>
            <p className="hero-subtext">
              Realize your dream of family with world-class IVF technology, 
              personalized fertility plans, and compassionate care at every step.
            </p>
            <div className="hero-buttons">
              <button 
                className="btn btn-primary"
                onClick={() => navigate('/services')}
              >
                Book Free Consultation
              </button>
              <button 
                className="btn btn-secondary"
                onClick={() => navigate('/services')}
              >
                Explore Treatments
              </button>
            </div>
            
            <div className="stats-row">
              <div className="stat-item">
                <strong>10k+</strong>
                <span>Successful Births</span>
              </div>
              <div className="stat-item">
                <strong>98%</strong>
                <span>Satisfaction Rate</span>
              </div>
            </div>
          </div>

          <div className="hero-visual animate-on-scroll fade-in delay-200">
            <div className="visual-card main-card slow-pulse">
              <div className="card-icon">🧬</div>
              <h3>Advanced Embryology</h3>
              <p>State-of-the-art genetic screening.</p>
            </div>
            <div className="visual-card floating-card-1">
              <span>👶</span> Dreams Realized
            </div>
            <div className="visual-card floating-card-2">
              <span>🔬</span> Precision Labs
            </div>
          </div>
        </div>
      </section>

      {/* --- WHY CHOOSE US SECTION --- */}
      <section className="section features-section">
        <div className="content-wrapper">
          <div className="section-header animate-on-scroll slide-up">
            <h2>Why Choose Our IVF Center</h2>
            <p>Combining science and empathy to deliver the highest success rates.</p>
          </div>
          
          <div className="features-grid">
            <div className="feature-card gradient-hover animate-on-scroll slide-up delay-100">
              <div className="icon-box">🎯</div>
              <h3>High Success Rates</h3>
              <p>Our advanced protocols consistently deliver success rates well above the national average.</p>
            </div>
            <div className="feature-card gradient-hover animate-on-scroll slide-up delay-200">
              <div className="icon-box">🤝</div>
              <h3>Compassionate Care</h3>
              <p>A dedicated team of counselors and specialists to support you emotionally and physically.</p>
            </div>
            <div className="feature-card gradient-hover animate-on-scroll slide-up delay-300">
              <div className="icon-box">💡</div>
              <h3>Latest Technology</h3>
              <p>Equipped with Time-Lapse Imaging and Laser Assisted Hatching for better outcomes.</p>
            </div>
          </div>
        </div>
      </section>

      {/* --- SERVICES SECTION --- */}
      <section className="section services-section">
        <div className="content-wrapper">
          <div className="section-header animate-on-scroll slide-up">
            <h2>Fertility Treatments</h2>
            <p>Comprehensive solutions tailored to your unique biology.</p>
          </div>

          <div className="services-grid">
            {[
              { title: 'In Vitro Fertilization (IVF)', desc: 'Advanced assisted reproductive technology for complex fertility cases.' },
              { title: 'IUI (Insemination)', desc: 'A less invasive first step for many couples trying to conceive.' },
              { title: 'ICSI', desc: 'Intracytoplasmic Sperm Injection for severe male factor infertility.' },
              { title: 'Egg Freezing', desc: 'Empower your future by preserving your fertility today.' },
              { title: 'Male Infertility', desc: 'Comprehensive diagnosis and treatments for male reproductive health.' },
              { title: 'Genetic Testing', desc: 'PGT-A and PGT-M testing to ensure a healthy pregnancy.' }
            ].map((service, index) => (
              <div key={index} className={`service-card gradient-hover animate-on-scroll slide-up delay-${(index % 3) * 100}`}>
                <div className="service-icon-wrapper">
                  <div className="dot-pulse"></div>
                </div>
                <h3>{service.title}</h3>
                <p>{service.desc}</p>
                <span className="learn-more" onClick={() => navigate('/services')}>View Details &rarr;</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* --- DOCTORS SECTION --- */}
      <section className="section doctors-section">
        <div className="content-wrapper">
          <div className="section-header animate-on-scroll slide-up">
            <h2>Meet Our Fertility Experts</h2>
            <p>Renowned specialists dedicated to making your dream come true.</p>
          </div>

          <div className="doctors-grid">
            {doctors.map((doc, idx) => (
              <div key={idx} className="doctor-card animate-on-scroll fade-in">
                <div className="doctor-img-wrapper">
                  <img src={doc.image} alt={doc.name} className="doctor-img" />
                  <div className="doctor-overlay">
                    <button className="btn-icon">📅</button>
                    <button className="btn-icon">✉️</button>
                  </div>
                </div>
                <div className="doctor-info">
                  <h3>{doc.name}</h3>
                  <span className="specialty">{doc.role}</span>
                  <div className="social-dots">
                    <span>•</span><span>•</span><span>•</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* --- TESTIMONIALS SECTION --- */}
      <section className="section testimonials-section">
        <div className="content-wrapper">
          <h2 className="animate-on-scroll slide-up">Stories of Hope</h2>
          <div className="testimonials-row animate-on-scroll slide-up delay-200">
            <div className="testimonial-card">
              <div className="quote-icon">“</div>
              <p>After 5 years of trying, this center gave us our miracle baby. The doctors were patient and the technology is top-notch.</p>
              <h4>- The Williams Family</h4>
            </div>
            <div className="testimonial-card">
              <div className="quote-icon">“</div>
              <p>Professionalism mixed with genuine care. They explained every step of the IVF process clearly. Highly recommended.</p>
              <h4>- Sarah & James</h4>
            </div>
          </div>
        </div>
      </section>

      {/* --- CTA SECTION --- */}
      <section className="cta-section animate-on-scroll zoom-in">
        <div className="cta-content">
          <h2>Ready to Start Your Family?</h2>
          <p>Book a confidential consultation with our fertility experts today.</p>
          <button 
            className="btn btn-white"
            onClick={() => navigate('/services')}
          >
            Schedule Appointment
          </button>
        </div>
      </section>

    </div>
  );
};

export default Home;