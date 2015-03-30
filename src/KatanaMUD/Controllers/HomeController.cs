﻿using KatanaMUD.Messages;
using KatanaMUD.Models;
using Microsoft.AspNet.Mvc;
using System.Linq;

// For more information on enabling MVC for empty projects, visit http://go.microsoft.com/fwlink/?LinkID=397860

namespace KatanaMUD.Controllers
{
	public class HomeController : Controller
	{
		// GET: /<controller>/
		public IActionResult Index()
		{
			return View();
		}

        [Authorize]
        public IActionResult Game()
        {
            return View();
        }

        [Authorize]
        [HttpGet]
        public IActionResult ChooseRace()
        {
            var actor = new Actor() { Name = Context.User.Identity.Name };
            var context = new GameContext();
            ViewBag.Races = context.RaceTemplates.ToList();
            return View(actor);
        }

        [Authorize]
        [HttpPost]
        public IActionResult ChooseRace(Actor actor)
        {
            var context = new GameContext();
            ViewBag.Classes = context.ClassTemplates.ToList();

            return View("ChooseClass", actor);
        }

        [Authorize]
        [HttpPost]
        public IActionResult ChooseClass(Actor actor)
        {
            ViewBag.IsNew = true;
            var context = new GameContext();
            actor.CharacterPoints = 100;    // TODO: From settings?
            actor.RaceTemplate = context.RaceTemplates.Single(x => x.Id == actor.RaceTemplateId);
            actor.ClassTemplate = context.ClassTemplates.Single(x => x.Id == actor.ClassTemplateId);
            actor.Agility = actor.RaceTemplate.Agility;
            actor.Charm = actor.RaceTemplate.Charm;
            actor.Health = actor.RaceTemplate.Health;
            actor.Intelligence = actor.RaceTemplate.Intelligence;
            actor.Strength = actor.RaceTemplate.Strength;
            actor.Wisdom = actor.RaceTemplate.Wisdom;
            actor.Name = Context.User.Identity.Name;

            return View("EditStats", actor);
        }

        [Authorize]
        public IActionResult CreateCharacter()
        {
            var actor = new Actor() { Name = Context.User.Identity.Name };
            return View(actor);
        }
    }
}
